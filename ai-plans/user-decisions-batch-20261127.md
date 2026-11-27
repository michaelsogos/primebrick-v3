# Batch decisioni utente 2026-11-27 (slices 2/3/4/5 — spec Clienti rinviata)

**Status**: 🟠 WIP — decisioni ratificate dall'utente in chat: 2 ok, 3 ok, 4 ok, 5 ok; 1 (spec Clienti) rinviata.

## Slice 2 — fix doc icon-conventions.md:31 (dict mapping stale)

### Doc receipts
- `primebrick-fe-v3/docs/ai/icon-conventions.md:31` — testo stale: "`dict`→`list`, `list`→`table-2`"
- `primebrick-be-v3/src/modules/system/module-discovery.service.ts:151-153` — commento verità:
  "dict→table-dictionary, list→table-2, forms→text-cursor-input, everything else→file-box"
- `primebrick-be-v3/src/modules/system/__tests__/module-discovery.service.test.ts:469` —
  prova eseguibile: `dict` route icon === "table-dictionary" (test verde nella suite)

### SPEC RED (pre-fix, questa sessione)
- `grep "dict\`→\`list" icon-conventions.md` → match presente a :31 — il doc contraddice il codice

### Implementazione
una parola: `list` → `table-dictionary` nel mapping dict (il resto della riga era già corretto)

### Slice 2 GREEN (2026-11-27)
- grep post-fix: :31 recita `dict`→`table-dictionary`, zero occorrenze stale
- prova del 9: la riga corretta è il testo che l'utente legge nel doc — allineata alla
  verità eseguibile del test module-discovery:469

## Slice 5 — doc-family checker permanente (2026-11-27)
- spec RED controllo negativo: checker su copia docs con dottrina strappata → FAIL corretto
- implementazione: `check-i18n-docs.mjs` identico in fe/scripts, be/scripts, sdk/tools, us/scripts —
  auto-configurante (scansiona docs/ per i filename della famiglia, esclude generated/)
- wiring: `check:standards` in fe/be/sdk (gira in predev+test), `predev` in us-v3/crm
- GREEN standalone: fe 4/4, be 4/4, sdk 1/1, us 1/1 compliant
- prova del 9 catena reale: BLOCCATA da anomalia pre-esistente — vedi sotto

### ⚠️ ANOMALIA riportata (non di questo slice): fe `check:standards` già rossa
35 violazioni [e2e-wait-budget] in nav-derive-crm/nav-leaf-ordering/nav-popover-creates/
remote-vendor-drift — spec di sessioni precedenti, NON toccate qui. La mia spec
crm-i18n-parity non è flaggata. Effetto: il gate i18n-docs in fe è shadowato dal rosso
pre-esistente. Decisione utente richiesta: fix budget nelle spec vs allowlist long-poll.

## Slice anomaly — wait-budget fix (opzione 1 ratificata)
- receipts: `fe-v3/docs/ai/e2e-browser-session.md:79-82` — "5 seconds is the expectation budget…
  nothing in the app legitimately takes longer than 5s per step"
- RED: `check:standards` 35 violazioni (dimostrato questa sessione); inventory: 10s×9 + 15s×6 nei
  4 spec pre-esistenti + 10s×7 in crm-i18n-parity (inclusa nel fix — nessuna eccezione)

### Slice anomaly GREEN + anomalia residua riportata (2026-11-27)
- fix wait-budget: 10s/15s → 5s in 5 spec (inclusa crm-i18n-parity — nessuna eccezione)
- fix ext-json: `.json()`/JSON.stringify → codec canonico; boundary browser corretto per doc
  (`.text()` dentro page.evaluate, `extJsonParse` in node — doc ext-json.mdx:135 "Node contexts")
- check:standards GREEN end-to-end — incl. gate i18n-docs (35+13 violazioni → 0)
- serial run 1 worker: **17 passed** — vendor-drift 3/3 (il fallimento parallelo era interferenza
  worker sul CDP Edge condiviso, non lentezza: nessuna eccezione necessaria, dottrina confermata),
  crm-i18n-parity 3/3, nav-derive-crm 13/14
- ⚠️ ANOMALIA pre-esistente (NON di questo slice, report per decisione utente):
  `nav-derive-crm.spec.ts:258` (commit 69e07d8) si aspetta la create leaf IN SIDEBAR —
  contraddice il design ratificato "create visibili SOLO nel popover" e la spec gemella
  nav-popover-creates:19 (verde: sidebar does NOT). Le due spec canoniche si contraddicono —
  una delle due mente. Evidenza forte: design ratificato = solo popover → :258 è stale.

### Contraddizione :258 RISOLTA (2026-11-27) — decisione utente: popover-only confermato
- utente ratifica: creates `sidebar:false` autowired, popover con RBAC + toggle disabled
- :258 riscritto come pin del contratto: payload `sidebar === false` sulla create leaf +
  DOM truth sidebar count === 0; la fonte `derive-entity-nav.ts:156-162` documenta il design
- GREEN in sessione: nav-derive-crm **13/13 in 1.9m** — entrambe le spec canoniche ora
  pinnano la stessa verità ratificata

## Slice 6 — convenzione label nav/titoli ratificata (2026-11-27)
- CREATE = {NEW}+{singolare} (già esistente) · LIST = {LIST}+{plurale} — nuovo
- titolo pagina list IDENTICO alla leaf; titolo pagina create IDENTICO alla leaf create
- customers: icona authored ok, label NON authored — stessa chiave e composizione di tutti
- receipts: derive-entity-nav.ts:130-175 (list leaf/route condividono label_key — titolo già
  identico by construction; create route label_key "app.common.new" da correggere),
  nav-declaration.ts:41,48-58 (customers authored, create label_key app.common.new)

### Slice 6 GREEN (2026-11-27)
- RED: 30 mismatch/lingua esatti (title+nav bare plural vs composed) — dimostrato pre-implementazione
- patch `20270101180000_nav_list_composition_x7.sql` (224 UPDATE + 7 INSERT customers.nav.create),
  firmata devin-agent, applicata, redis flush
- wiring: derive-entity-nav.ts:172 + nav-declaration.ts:54 — create route label_key → `.nav.create`
  (create title ≡ create leaf by construction, come list); sdk rebuild tsc clean
- GREEN 3/3 in 31.7s — popover rows reali: de "Liste Kunden"/"Neue Adresse"+"Liste Adressen"
  pairing intatto; keyset 357×7 completo
- nota onesta: il payload nav si ri-emette alla registrazione del servizio — il wiring create-title
  è effettivo al prossimo restart dei servizi (le create page sono ancora stub, impatto forward-looking);
  il cambio valori nav/title è live SUBITO perché risolto a read-time dal dict
