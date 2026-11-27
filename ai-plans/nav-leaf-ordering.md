# Nav leaf ordering — pinned authored + alphabetical by language + last-by-design

# ⚠️ TURN PROTOCOL — READ THIS BLOCK EVERY TURN. IT IS THE WORKFLOW.

Every turn, in this order, NO EXCEPTIONS:
1. Read this whole plan — this block IS the operative workflow.
2. Fill in DOC RECEIPTS below before any action (cite doc:line).
3. State of the world = VERIFICATION LEDGER, never your memory.
4. Execute only the declared scope. Anomaly → STOP → report, max 2 retries.
5. Before closing: write verdict + ledger + next step into the plan.
6. Prova del 9: every state claim carries `file:line` — if you cannot
   cite it, you did not verify it, it is an assumption.

## DOC RECEIPTS (fill before acting)
| doc:line | what it says | how it applies this turn |
|---|---|---|
| primebrick-v3-core/src/page-route.ts:220-234 | ModuleNavLink NON ha campo order — nessuna semantica di ordinamento nel contratto | il contratto va esteso in modo additivo (`order?: number`) |
| primebrick-v3-sdk/src/http/derive-entity-nav.ts:113-135 | derivazione fa push in ordine di registrazione entità — ordine accidentale | la derivazione copia l'eventuale order dalla decl; le unpinned restano senza order |
| primebrick-v3-sdk/src/microservice/create-microservice.ts:650-656 | builtin contributions merge LAST inside their sibling | sequences-ultimo oggi è effetto collaterale del merge — diventa pin esplicito strutturale |
| primebrick-fe-v3/src/lib/components/AppSidebar.svelte:37-42,181 | navItems derivato filtrato per root; label risolta a render via $t(item.label_key) | l'ordinamento alfabetico per lingua è possibile SOLO qui — la traduzione esiste solo a render |
| payload empirico service_registry (query 2026-11-27) | ordine live: root = customers + registrazione; settings = registrazione + sequences ultimo | la spec RED inchioda l'ordine VISIBILE atteso, non il meccanismo |
| primebrick-us-v3/crm/src/nav-declaration.ts | customers authored unica leaf root | customers resta pinned primo (order 1) |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-27 | playwright nav-leaf-ordering.spec.ts (pre-fix) | RED confermato | ordine visibile = registrazione (Customer Types, Company Dimensions…) vs alfabetico atteso (Account Types, Address Types…) — error-context snapshot DOM | implementazione |
| 2026-11-27 | vitest nav-ordering.test.ts | GREEN 6/6 poi 7/7 | pinning, clamp-last, collisioni, recursion children, raw keys, BigInt wire | — |
| 2026-11-27 | GREEN run 1 | ANOMALIA risolta | "Cannot convert a BigInt value to a number" — il codec ext-json bigint-safe consegna order come BigInt; coercion al consumer boundary + test wire-bigint aggiunto. Lezione: ogni int di contratto va trattato come potenziale BigInt nel consumer FE | rerun |
| 2026-11-27 | query service_registry | payload aggiornato | customers order:1, sequences order:1000000, resto unpinned — dev-hot ha ri-registrato senza restart manuali | GREEN |
| 2026-11-27 | playwright nav-leaf-ordering.spec.ts (post-fix) | GREEN 2/2 | settings: unpinned A-Z + sequences ultimo; root: customers primo + resto A-Z — sullo stack reale | prova del 9 |
| 2026-11-27 | core/dal/sdk build+test | verdi | core 255+1skip, dal 903/903, sdk typecheck pulito | commit |

## Status: 🟢 GREEN — Plan date: 2026-11-27 / sera

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | TIC: doc receipts + direttiva registrata | ✅ done | 2026-11-27 | questa sezione |
| 2 | Spec RED e2e: ordine visibile sidebar — pinned primo, unpinned A-Z per label, sequences ultimo | ✅ done | 2026-11-27 | RED dimostrato pre-fix |
| 3 | core: ModuleNavLink.order?: number (contratto additivo) | ✅ done | 2026-11-27 | page-route.ts |
| 4 | sdk: contribution+merge pass-through order; sequences builtin pinned ultimo (dal) | ✅ done | 2026-11-27 | pin 1M clamp-to-last; pass-through decl derivata NON implementato — YAGNI, nessun consumer, 1 riga se serve |
| 5 | fe: sort render-time — pinned per order poi unpinned alfabetici per label tradotta (locale app) | ✅ done | 2026-11-27 | sortNavLeaves + AppSidebar; BigInt coercion al boundary |
| 6 | us-v3 crm: customers pinned order 1 in nav-declaration | ✅ done | 2026-11-27 | payload live verificato |
| 7 | Spec GREEN eseguita in sessione | ✅ done | 2026-11-27 | 2/2 stack reale |
| 8 | Prova del 9 end-user browser reale | ⏳ not done | — | preview aperta all'utente |
| 9 | Ledger + commit + push (core, sdk, dal, fe-v3, us-v3, workspace) | ⏳ in corso | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Direttiva utente 2026-11-27 (ratificata)

Semantica CONFERMATA dall'utente ("mi piace, pinned authored + unpinned
A-Z + last by design"):

1. **Pinned** — una leaf con `order` esplicito vince: occupa la posizione
   N (1-based) nell'array finale. Pin in ordine di N; N oltre la lunghezza
   = ultimo; collisione di N = spareggio alfabetico.
2. **Unpinned** — tutte le altre leaf riempiono gli slot rimanenti in
   ordine ALFABETICO per label tradotta, nella lingua dell'app (il sort
   vive nel render FE — unico luogo dove la traduzione esiste).
3. **sequences ultimo per design** — non più effetto collaterale del
   merge builtin: pin esplicito strutturale.
4. Scope: vale per ogni array di leaf (root module + ogni sibling) —
   crm-crm e crm-settings citati esplicitamente dall'utente.
5. NIENTE DB ora — il riordino end-user futuro è user-preference (il
   canale esiste già: userPreferences in sidebar). Il campo order nel
   contratto è forward-compatible.

## Note di design

- Il sort è per-array (root nav, ogni sibling nav) — mai globale.
- Labels raw non tradotte: ordinano per la stringa grezza — accettabile,
  la raw key è già di per sé un bug surface.
- localeCompare con locale dell'app, sensitivity base.
- Anche i `children` dei gruppi ordinano con la stessa regola (stesso tipo).
