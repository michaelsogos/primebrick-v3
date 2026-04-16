# Primebrick workspace (backend + frontend)

Questo workspace è solo un **contenitore** per due repository git separati:

- `backend/` — API Primebrick (Express + TypeScript)
- `frontend/` — UI Primebrick (SvelteKit + Svelte 5 + TypeScript)

Ogni repo è **autosufficiente**: puoi clonarli e usarli separatamente senza questo workspace.

## Come ricreare il workspace

1. Clona il repo backend in `backend/`:

   ```bash
   git clone <URL_BACKEND_REPO> backend
   ```

2. Clona il repo frontend in `frontend/`:

   ```bash
   git clone <URL_FRONTEND_REPO> frontend
   ```

3. Installa le dipendenze:

   - Solo backend:

     ```bash
     cd backend
     pnpm install
     ```

   - Solo frontend:

     ```bash
     cd frontend
     pnpm install
     ```

   - Oppure dal workspace root (opzionale, se vuoi usare il workspace pnpm):

     ```bash
     pnpm install
     ```

## Comandi comodi (se usi il workspace)

Dal root di questo workspace puoi:

- Avviare solo il backend:

  ```bash
  pnpm -C backend dev
  ```

- Avviare solo il frontend:

  ```bash
  pnpm -C frontend dev
  ```

Gli script dettagliati vivono nei singoli `backend/package.json` e `frontend/package.json`.

## Uso con Cursor o altri agent

- Se lavori **solo sul backend**, apri la cartella `backend/` come progetto:
  - L'agente userà `backend/AGENTS.md`, `backend/CLAUDE.md`, `backend/.cursor/*`, `backend/docs/ai/*`.

- Se lavori **solo sul frontend**, apri la cartella `frontend/` come progetto:
  - L'agente userà `frontend/AGENTS.md`, `frontend/CLAUDE.md`, `frontend/.cursor/*`, `frontend/docs/ai/*`.

- Se vuoi una **vista full‑stack**, apri questa cartella workspace:
  - L'agente vedrà entrambe le sottocartelle e potrà combinare le informazioni, seguendo comunque le regole locali definite nei due repo.

## GitFlow (team rule)

- Non lavorare direttamente su `main` o `develop`.
- Apri sempre una branch GitFlow (`feature/*`, `release/*`, `hotfix/*`) e mantieni la pulizia: dopo il merge elimina la branch sia localmente che sul remote.

\n- GitFlow test change
\n## v0.1.0\n- First release (GitFlow dry run)\n
\n- Hotfix test change
