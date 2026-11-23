# EntityFormSurface — extraction plan (ONE form engine for page + sheet)

## Status: 🔵 TIC — decisioni Q1–Q5 bloccate, awaiting PROCEED

### Decisioni utente (finali)

| # | Decisione |
|---|-----------|
| Q1 | Submit label mode-driven UNIFORME: `mode==='create'` → `app.common.create`; update/detail → `app.common.save` — **page e sheet identiche** (page oggi sempre "Save" → cambia a "Create" su create) |
| Q2 | Dirty-close guard: `editing && formGuard.hasChanges` → ✕/click-outside/Escape intercettati (`SheetHost:161-168` handlers centrali) → **NATIVE `window.confirm`** — DECISIONE UTENTE (supersedes governed-dialog): lock sincrono del browser richiesto, il dialog in-app lascia una race window (confirm() blocca il thread → nessun overlap possibile). Exempt `no-native-dialog` SOLO per `useUnsavedChangesGuard.svelte.ts` via `allowPaths` in `.devin/check-standards.json`. **pencil-off escluso** (discard silenzioso intenzionale). Dopo confirm: `draft.clear()` + form reset — niente stale data (vale anche per la page) |
| Q3 | Audit per-chrome confermato: page → footer audit box; sheet → accordion. Version badge sul footer presente in entrambe (`FormPageLayout:62` + record-sheet) — niente drift |
| Q4 | Draft key condivisa page↔sheet — keep; **E2E edge-case obbligatorio** (stesso record aperto su due superfici) |
| Q5 | Construction gate: validator SDK della decl throw su placements `kind`/`managed`/`audited`/`uid`/`hidden` — enforcement a dichiarazione |

> Trigger: `entity.record` (update+create) gira raw-draft senza
> zod/superform — la decisione `EntityFormSurface` in
> `elt-ref-cell-sheet-plan.md` (task 3d, DECIDED user) non è mai stata
> eseguita. Questo piano la implementa per filo e per segno, da
> inventario empirico — zero assunzioni.
>
> Vincolo layout (utente): UNA `page_props.form` DECL → DUE superfici
> identiche. Le placements `col/row/span` si osservano ovunque; la sheet
> (superficie stretta) collassa a una colonna via `@container` — stesso
> meccanismo "mobile" già in `EntityRecordSheetBody` (`@max-xl` reset).

---

## 1. Inventario empirico — cosa possiede `EntityFormPage` oggi

Tutto verificato file:linea in `src/lib/entity-form/EntityFormPage.svelte`
(641 righe) + `build-entity-form-schema.ts` (215 righe).

### 1.1 Input e load (chrome — RESTA nella page)

| Pezzo | Linee | Cos'è |
|---|---|---|
| `decl`/`modules` props, `basePath`=`entityApiBase(entity)`, `formDecl`, `isDetail`, `listHref`, `recordUuid` (da `[param]` census route) | 50-69 | Route-derivation — SOLO page |
| `attemptLoad` → `fetchEntityMeta` + GET record (detail) + `recordVersion` | 82-99 | Load — la sheet ha il suo `load()` equivalente |
| SSE `useServiceAvailability` gate + retry ≤3 | 101-125 | Chrome page (la sheet ha heroes propri) |

### 1.2 FORM ENGINE (da estrarre — il cuore)

| Pezzo | Linee | Destinazione surface |
|---|---|---|
| `useCensusSubjectOptions(modules)` → census emits/callables decls+options | 127-131 | SURFACE (prop `modules`) |
| `prepared = buildEntityFormSchema(meta, formDecl, env)` → `{schema, fields}`; `resolveCallable`/`resolveEmit` live-closure | 133-149 | SURFACE |
| `buildInitial()` — detail: record values (json→stringify, `format:"sequence"`→`''`, bool→false, else `v ?? ''`); create: `placement.default_value` ?? bool→false ?? `''` | 178-203 | SURFACE |
| `superForm(defaults(initial, zod4(schema)), {SPA:true, validators:zod4, validationMethod:'oninput', dataType:'json', onChange:forceValidate, onUpdate})` → `{form,errors,enhance,tainted,isTainted,reset}` | 205-322 | SURFACE |
| `onUpdate` payload assembly: skip `immutable` su detail; `''`/`undefined` → omit (seq: mai null) oppure `null` se `nullable`; json parse; `version` su detail; `X-Client-Session` header; `PUT {base}/{uuid}` / `POST {base}`; ERR01→`collab.handleVersionConflict()`; RETURNING row → `record`/`recordVersion` rebaseline; `reset({newState:$form})` | 215-320 | SURFACE (endpoint via props, sotto) |
| `payload_map` machine-seeding effect (`seedPayloadMapEntries`, once-per-pair, untainted) | 338-374 | SURFACE (generico su decl+columns) |
| `job_trigger_shape` coercion (`run_as` originator→author, `taint:'untaint'`) | 376-395 | SURFACE (guidato da `decl.validators`) |
| `forceValidate` + `formGuard` (hasChanges=isTainted, canSave) | 397-404 | SURFACE — espone guard ai chrome via bindable |
| `useUnsavedChangesGuard` (beforeUnload + `handleCancel`) | 405-408 | PAGE (nav). Sheet: vedi §4-G7 |
| `useSyncChannel` sender → refresh lista parent | 409-415 | SURFACE (serve anche alla sheet — §4-G6) |
| `useCollaborativeForm` — gated `isDetail && recordUuid && meta.collaboration.enabled` | 417-444 | SURFACE (gated uguale su sheet-update) |
| `useFormDraft` — storage key org+actor+entity+mode+uuid; tainted-replay; conflicts→collab | 446-480 | SURFACE |
| `handleReset` — create: `buildInitial`; detail: refetch fresh + conflicts resolve + `seededFor=null` + `reset({newState})` | 482-516 | SURFACE |
| `fieldStyle(placement)` → grid-column/row inline | 518-525 | SURFACE |
| `fieldCollabClass` ring (conflict destructive / merge emerald) | 527-534 | SURFACE |
| `FormField form={formObj} name` + `FormControl` + `EntityFormField inForm` + `TranslatedFormFieldErrors` | 579-610 | SURFACE |
| `editingNames`, `targetCallable`, `sourceEmit`, `disabledBadgeValues` (triggerShape), `readonly=isConflicted`, `mode`, `served_record`, `service`, `bind:value={$form[k]}`, `bind:record={$form}` | 583-605 | SURFACE |

### 1.3 Chrome page (RESTA fuori dalla surface)

- `FormPageLayout` (audit footer `buildAuditData`, header, layout)
- `<form id="entity-form" use:enhance>` wrapper + `grid grid-cols-2`
- Footer: `entity-form-reset` (eraser, `disabled={!hasChanges}`),
  Cancel (`handleCancel` → unsaved-changes → back),
  `entity-form-submit` (plain text, `disabled={!canSave||submitting}`)
- `data-has-changes`/`data-tainted` testid attrs (surface-owned, pagina li eredita)
- `ServiceUnavailableView` + heroes

### 1.3b Identity pill — drift tra page e sheet (utente)

- Sheet: `EntityRecordUid` (`entity-list/sheets/`) — label
  `{singular} ID` + mono badge + copy CTA — primo elemento del body
  (`uidBlock` = `record[uid]` definito)
- Detail page: **nessuna pill** — `FormPageLayout:108` mostra il uid
  solo dentro l'audit footer come testo italic muto
- Decisione: la surface renderizza `EntityRecordUid` come primo
  elemento quando `mode==='update' && record[uid]` esiste — UNA
  dichiarazione, entrambe le superfici (create → assente per
  costruzione, heroes sheet la riusano già per gli stati errore).
  Componente spostato da `entity-list/sheets/` a `entity-form/` —
  consumatori: surface + sheet heroes.

### 1.4 Cosa possiede la sheet oggi (da sostituire)

`EntityRecordSheet.svelte` + `EntityRecordSheetBody.svelte`:

- `draft` `$state` + `bind:value` — **sostituito da `$form`**
- `saveKeys` + `dirtyFields()` diff → **sostituito dall'assembly schema-driven**
- `save()` raw PUT/POST → **sostituito da `onUpdate`**
- `{#snippet field}` con `EntityFormField` senza `inForm` → **surface**
- `formColumns`/`formPlacements`/`formTwoCol` → **surface le risolve**
- Pencil `editing` toggle → **prop surface `editing`** (update-sheet:
  readonly fino a pencil; create + page: sempre true)
- Audit accordion, heroes, version/lifecycle badges, footer
  → **chrome sheet, restano**; uid badge → **surface §1.3b**
- `@container` + `@max-xl` collapse → **surface la possiede (§3)**

---

## 2. `EntityFormSurface.svelte` — contratto proposto

```ts
let {
  entity,                       // entity api name
  service,                      // owning svc code (builtin/via-svc)
  mode,                         // 'create' | 'update'
  meta,                         // served EntityMeta (chrome l'ha già)
  record,                       // update: la riga servita (create: {})
  recordUuid,                   // update: uid (collab/draft-key/PUT)
  modules,                      // census modules (resolveCallable/emit)
  form,                         // FormPageDecl | undefined → fallback synth (§3.2)
  editing = true,               // sheet-update pencil: false → tutti disabled
  formId = `efs-${counter++}`,  // unique per mount (sheet stacking!)
  onsaved,                      // (row, mode) → page: nav; sheet: morph
}: Props = $props();
```

**La surface possiede**: prepared/schema, buildInitial, superForm+SPA+validators,
onUpdate/payload-assembly/ERR01, machine-seeding effects, formGuard+forceValidate,
collab (gated), draft-persistence, reset, grid+fieldStyle+collabClass,
FormField+errors chrome, `use:enhance` `<form>` element, syncChannel sender.

**Espone ai chrome** (bindable getter): `formGuard` (hasChanges/canSave),
`submitting`, `handleReset`, `formObj` (per footer submit `form={formId}`).

**Resta ai chrome**: layout/page-vs-sheet anatomy, audit render, heroes,
pencil toggle, footer CTA composition, nav-after-save (`onsaved` callback).

### 2.1 Submit endpoint resolution

Page usa `PUT {basePath}/{uuid}` / `POST {basePath}`. La sheet-update
usa `findActionEndpoint('update.single')`/`create.single` + `fillActionPath`
+ `serviceApiPrefix`. La surface unifica: `entityApiBase(entity, service)`
+ `findActionEndpoint(meta.actions, op)` — STESSO resolution contract per
entrambe le superfici (gli action endpoints governano, il fallback è il
path canonico). Un solo commit path.

### 2.2 Fallback decl synthesis

`buildEntityFormSchema` richiede `decl.fields` e THROWS su drift — bene.
La surface, `form` prop assente, sintetizza:

```ts
fields = orderedColumns(meta.columns).filter(c =>
  !c.hidden && !c.audited && !c.kind && !c.managed &&
  c.key !== meta.uid && c.key !== 'version'
).map(c => ({ key: c.key }))
```

UN mechanism per entrambe (page con census decl → authored; sheet/builtin
senza → synth). `managed` aggiunto al filtro (allinea `saveKeys` attuale).

### 2.3 Grid responsiva — UNA decl, DUE superfici

La surface renderizza SEMPRE `<div class="@container">` + grid con
placement `fieldStyle` + reset `@max-xl:col/row-start/end-auto!` (il
meccanismo già provato in `EntityRecordSheetBody:160-187`). La page
(container largo) ottiene `grid-cols-2` pieno; la sheet (xs) collassa a
una colonna — **stesso CSS contract, la larghezza decide**. La page perde
`grid grid-cols-2` fisso → guadagna lo stesso container-relative behavior
(una page stretta — popup 400px — collassa identica. Bonus, non regression:
placement `col:2` su container xs oggi romperebbe comunque).

### 2.4 Form element + submit

`<form id={formId} use:enhance>` dentro la surface; i chrome mettono il
submit button FUORI dal form con `form={formId}` (pattern già in uso:
`entity-form-submit` type=submit form="entity-form"). `formId` unico per
mount → sheet stacking sicuro.

---

## 3. Gap da chiudere (verificati, non assunti)

| # | Gap | Risoluzione |
|---|-----|-------------|
| G1 | Sheet: niente superForm/schema/errors/tainted | SURFACE (tutto §1.2) |
| G2 | Sheet: niente reset (create) / implicito via toggle (update) | `entity-record-sheet-reset` eraser, `disabled={!formGuard.hasChanges}` — anatomia canonica |
| G3 | Sheet: niente per-field error chrome | `FormField`+`TranslatedFormFieldErrors` (surface) |
| G4 | Sheet: `<Check>` icon su save (drift) | plain text `{$t('app.common.save')}` / `app.common.create` — canonico |
| G5 | Sheet create: Cancel inutile | via — abort = ✕ sheet. Update: Cancel inutile — pencil toggle GIÀ re-baselinea il draft (effetto `$effect` su `editing`); footer update = Reset+Save soli |
| G6 | Sheet: lista non si refresha dopo save | `useSyncChannel` sender nella surface → ELT receiver già esistente si aggiorna. Fix collaterale reale |
| G7 | Unsaved-changes su sheet-close | **DECISO Q2 (rev. nativo)**: `editing && hasChanges` → ✕/outside/Escape → `window.confirm` (lock sincrono — no race); pencil-off escluso. Confirm → `draft.clear()`+reset. Hook centrale SheetHost (`onEscapeKeydown`/`onInteractOutside`/`onOpenChange`) + per-sheet `shouldBlockClose` registry (nuovo, in sheet-manager — surface lo registra). `UnsavedChangesGuardHost` rimosso — il channel in-app è morto |
| G8 | Collab in sheet | surface la possiede, gated `mode==='update' && uuid && collab.enabled` — gratis, stessa machinery |
| G9 | `prepared` richiede decl — builtin senza form route | synth fallback §2.2 |
| G10 | Draft-key sheet vs page | stessa key-shape (entity+mode+uuid) — coerente, nessuna collisione (superfici diverse, stesso record = stesso draft. Voluto? — sì: il draft È del record, non del container) |
| G11 | `triggerShape`/`payload_map` specifics | surface (leggono `decl.validators`/`columns` — generici, non job-coupled) |
| G12 | `EntityFormField` già supporta `inForm` + FormControl context | la sheet ora entra nel context → stesso chrome errori |
| G13 | `saveKeys`-equivalent nel submit | l'assembly itera `decl.fields` — synth fallback ⇒ identico set di oggi meno `managed` (fix) |

---

## 4. Rischi aperti (da verificare in TOC)

1. **`use:enhance` dentro sheet**: SPA mode — superforms non richiede
   `<form>` nativo? EntityFormPage usa `use:enhance` su `<form>`: la
   surface renderizza il proprio `<form>` (dentro la scroll area della
   sheet è legale HTML).
2. **`formGuard`/`submitting` verso chrome**: export bindable
   (`export const guard` non rune-reactive → `$derived` prop callback o
   snippet params). Pattern: surface accetta `footer` snippet con
   `{formGuard, submitting, handleReset}` args — o espone via
   `bind:this` API. Decisione TOC: **snippet args** (più Svelte-idiomatico).
3. **`collab.channel` in sheet**: `useCollaborativeForm` si autowire —
   costo SSE in più per sheet-update su entità auditable. Gate identico.
4. **Regression superfici esistenti**: users/clients/orgs pages + dict +
   bulk restano com'erano (out of scope T7 — convergenza registrata).
5. **`bind:record={$form}`** — EntityFormField usa record come context
   (cascade `depends_on`); surface passa `$form` stesso — identico.

---

## 5. Task (TOC)

| # | Task | File | Stato |
|---|------|------|-------|
| T7.1 | `EntityFormSurface.svelte` — estrazione integrale §1.2 + synth fallback + @container grid + snippet footer args | `src/lib/entity-form/EntityFormSurface.svelte` (NEW) | ✅ fe `1518c78` — E2E PUT+POST verdi |
| T7.2 | `EntityFormPage` refactora sopra — tiene solo §1.1+§1.3 (load, chrome, footer CTAs) | `EntityFormPage.svelte` | ✅ fatto |
| T7.3 | `EntityRecordSheet`→surface mount; footer canonico (Reset+Save/Create, no Check/Cancel); `EntityRecordSheetBody` DELETED; audit accordion nel panel; uid pill dentro la surface (page+sheet) | `EntityRecordSheet.svelte`, `EntityRecordUid.svelte` | ✅ fatto |
| T7.6rev | Close-guard nativo: `setSheetCloseGuard` registry + SheetHost funnel consult; `useUnsavedChangesGuard` → `window.confirm` (decisione utente); `UnsavedChangesGuardHost` rimosso; allowPaths exempt | sheet-manager, SheetHost, useUnsavedChangesGuard | ✅ fatto |
| T7.8 | Submit label mode-driven — page+sheet: create→"Create", update→"Save" | entrambi i footer | ✅ fatto |
| T7.9 | Collab `service` threading — audit diff/refetch su `/svc/<code>`; presence resta gateway (spec exemption) | useCollaborativeForm | ✅ fatto |
| T7.4 | E2E: spec esistenti verdi (13/13) + ampliare create-sheet: required block su submit vuoto, error chrome, reset→re-baseline, dirty-close native (dialog accept/dismiss), pencil-off silent reset, draft-share edge + test dedicato "validation gate — error chrome + zero wire, BOTH surfaces" | `src/e2e/sequences.spec.ts` | ✅ fatto — 16/16 verdi (89c6f98) |
| T7.4b | E2E wait-budget enforcement: `e2e-wait-budget` lint rule (sdk check-standards, alsoTests+appliesTo e2e/, NO_EXEMPT) → errore punta a docs/ai/e2e-browser-session.md; sweep repo a 5_000; long-poll dichiarati via allowPaths; helpers fissati | sdk + fe e2e + .devin/check-standards.json | ✅ fatto — 0 violazioni (a08c8d2 sdk, f723f26 fe) |
| T7.4c | Row dblclick → sheet se è previsto sheet (no `kind:"detail"` census route → `entity.record` update readonly), altrimenti page new-tab — wired in EntityTablePage via `onRowDblClick` prop | EntityTablePage + EntityListTable + types | ✅ fatto — e2e entrambi i lati (77f1ba2) |
| T7.5 | Docs SWEEP — entity-record-sheet.mdx (surface+PencilOff+zod+footer+native guard), entity-list-pages.md (dblclick), sheets.md (close-guard), entity-meta-schema ✅ già accurato, entity-confirm-dialogs ✅ fatto prima, core page-route.ts TSDoc, sdk nav-decl TSDoc | docs | ✅ fatto — fe 8f45ca5, core 88c6440 |
| T7.7 | SDK `validateNavDeclaration`/`validateFormPage` — throw su placements `kind`/`managed`/`audited`/`uid`/`hidden` | sdk | ✅ fatto — `PLACEMENT_SERVED_KEYS` errore mirato, 28/28 test (a3a6122) |

## 6. Acceptance

- [x] UNA sola `EntityFormSurface` — page e sheet la montano; grep
      `superForm(` → surface + auth + settings custom pages (carve-out)
- [x] Sheet create: submit vuoto → errori per-campo su required, NO POST
- [x] Sheet update: identico validation, ERR01 conflict path identico
- [x] Reset eraser presente su entrambe, `disabled` finché pristine
- [x] Nessun Check/Cancel nel footer sheet; plain Save/Create
- [x] `page_props.form` decl → stessa grid; sheet collassa @max-xl; page
      mantiene 2col su wide
- [x] Detail page mostra la pill uid (`EntityRecordUid`) identica alla
      sheet — primo elemento, `{singular} ID` + copy CTA; create → assente
- [x] SyncChannel: save sheet → lista dietro si refresha
- [x] Suite sequences 15/15 + ref-cell-sheet + entity-list specs verdi
- [x] `EntityFormPage` non contiene più `superForm(`/`buildEntityFormSchema(`
      diretti (delega alla surface)
