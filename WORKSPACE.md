# Primebrick workspace (backend + frontend)

This workspace is only a **container** for two separate Git repositories:

- `backend/` — Primebrick API (Express + TypeScript)
- `frontend/` — Primebrick UI (SvelteKit + Svelte 5 + TypeScript)

Each repo is **self-contained**: you can clone and use them without this workspace.

## Recreating the workspace

1. Clone the backend repo into `backend/`:

   ```bash
   git clone <URL_BACKEND_REPO> backend
   ```

2. Clone the frontend repo into `frontend/`:

   ```bash
   git clone <URL_FRONTEND_REPO> frontend
   ```

3. Install dependencies:

   - Backend only:

     ```bash
     cd backend
     pnpm install
     ```

   - Frontend only:

     ```bash
     cd frontend
     pnpm install
     ```

   - Or from the workspace root (optional, if you use the workspace pnpm layout):

     ```bash
     pnpm install
     ```

## Useful commands (if you use the workspace)

From the workspace root you can:

- Run the backend only:

  ```bash
  pnpm -C backend dev
  ```

- Run the frontend only:

  ```bash
  pnpm -C frontend dev
  ```

Detailed scripts live in `backend/package.json` and `frontend/package.json`.

## Using Cursor or other agents

- If you work **on the backend only**, open the `backend/` folder as the project:
  - The agent will use `backend/AGENTS.md`, `backend/CLAUDE.md`, `backend/.cursor/*`, `backend/docs/ai/*`.

- If you work **on the frontend only**, open the `frontend/` folder as the project:
  - The agent will use `frontend/AGENTS.md`, `frontend/CLAUDE.md`, `frontend/.cursor/*`, `frontend/docs/ai/*`.

- For a **full-stack view**, open this workspace folder:
  - The agent will see both subfolders and can combine context, still following the rules in each repo.

## GitFlow (team rule)

- Do not work directly on `main` or `develop`.
- If you are already on `feature/*`, `release/*`, or `hotfix/*`, the agent must **ask** whether to stay on that branch or open a new one for the task. If you stay on the current branch, **do not** debate whether the branch name “fits” the work.
- If you choose a **new** branch: the agent must **ask** whether to **close the previous branch first** (merge + delete) or leave it open; new `feature/*` / `release/*` branches always start from an **up-to-date `develop`**, and `hotfix/*` from an **up-to-date `main`** (`checkout` → `pull` → `checkout -b …`), unless you explicitly request otherwise.
- After a merge, delete the local and remote branch when you close out the flow.
