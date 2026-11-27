# Docs: i18n family interlinking + never-phase-2 doctrine

**Status**: 🟠 WIP
**Slice**: dichiarato 2026-11-27 — interlacciare i doc affini i18n e piantare la dottrina
"traduzioni tutte e subito in tutte le lingue, mai una fase 2" (ordine utente verbatim).

## Doc receipts (lette/verificate questa sessione)
- `primebrick-us-v3/docs/ai/i18n-namespace-segregation.md:52` — unico accenno esistente
  ("all seven supported languages") ma senza la clausola never-deferred e isolato
- `primebrick-fe-v3/docs/ai/i18n.md:1` — heading structure verificata (regole sorgenti, key convention,
  parity, redis invalidation)
- `primebrick-fe-v3/docs/ai/i18n-translation-sources.md:9` — golden rules BE-owned, nessuna clausola completezza
- `primebrick-fe-v3/docs/ai/translation-key-convention.md:8` — snake_case singular, nessun cross-link alla famiglia
- famiglia censita (10 canonici): fe{ i18n.md, i18n-translation-sources.md, translation-key-convention.md,
  dev-guide/i18n.mdx }, be{ i18n-namespace-segregation.md, translation-key-convention.md,
  translations-cache-invalidation.md, dev-guide/translations.mdx }, us{ i18n-namespace-segregation.md },
  sdk{ dev-guide/translations.mdx }

## RED evidence (2026-11-27, pre-implementazione)
- grep dottrina never-deferred: assente in 9/10 doc (solo accenno parziale in us segregation)
- cross-ref count per doc: 1-2 incidentalmente, nessuna sezione strutturata "Related documents"

## Spec
`temp/i18n-parity/check-doc-family.mjs` — per ogni doc canonico:
1. contiene la dottrina canonica "all seven supported languages" + "never deferred"
2. contiene una sezione "Related documents" con almeno 3 menzioni ai doc affini della famiglia

### GREEN (2026-11-27)
- checker `check-doc-family.mjs`: 10/10 docs OK — dottrina never-deferred presente ovunque,
  sezione "Related documents" con 7 menzioni famiglia per doc
- prova del 9: blocco verificato in coda a be-v3 docs/dev-guide/translations.mdx (testo inglese,
  dottrina "Never a phase 2" + mappa famiglia completa)
