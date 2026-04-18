# Prossima sessione — backlog (memo)

**Git stash (da recuperare):** su repo **backend** c’è uno stash (`AGENTS.md`, messo da `feature/agent-docs-modular` prima del branch onboarding). Elenca con `git stash list`, recupera quando serve con `git stash pop` sul branch giusto.

Da trasferire in **GitHub Projects / Kanban** (repo **Primebrick-v3**): creare issue per voce o raggruppare, poi collegarle al board.

1. Passare in rassegna i componenti in `lib` / UI (registry shadcn, coerenza).
2. Aggiungere **IANA TimeZone** (date/orari).
3. Rivedere le **push** e montare un sistema **WebSocket**.
4. **Avatar** più colorato, mai uguale allo sfondo topbar; eventualmente forma **esagonale**.
5. I **menu che non usano** il componente Menu (pattern ad hoc).
6. Menu con **tick** ma che dovrebbero usare **checkbox** (semantica).
7. I **menu senza hover** (stati chiari).
8. **Table row** senza hover.
9. Migliorare feedback **righe selezionate**.
10. **Button group** o **pannello azioni bulk**.
11. Modalità **master–detail 60/40** efficiente e piacevole.
12. **Menu di riga** con icone e separatori logici.

**Release completata:** `v0.4.0` su meta (`primebrick-v3`), `primebrick-v3-frontend`, `primebrick-v3-backend` (branch `release/0.4.0` chiuso, tag allineati).
