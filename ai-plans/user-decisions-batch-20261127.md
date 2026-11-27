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
