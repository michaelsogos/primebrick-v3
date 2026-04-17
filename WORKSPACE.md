# Primebrick workspace (three separate Git repositories)

Primebrick uses **three independent Git repositories**. Treat them as **peers**, not one monorepo:

| Repository | Typical folder in this workspace | Role |
|------------|----------------------------------|------|
| **Workspace / meta** | This directory (root `package.json`, `WORKSPACE.md`, `scripts/`) | Convenience scripts, docs, optional pnpm workspace glue |
| **Backend** | `backend/` | Primebrick API (Express + TypeScript) |
| **Frontend** | `frontend/` | Primebrick UI (SvelteKit + Svelte 5 + TypeScript) |

Each repo has **its own** `.git`, **its own** remotes, and **its own** GitFlow lifecycle. The root `.gitignore` ignores `backend/` and `frontend/` so the meta checkout does not track nested clones—those folders are **separate repos** checked out next to each other for local development.

You can clone and run **backend** or **frontend** alone without this workspace folder.

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

- Run both (dev):

  ```bash
  pnpm run dev
  ```

Detailed scripts live in `backend/package.json` and `frontend/package.json`.

## Quick map (where things live)

- Backend entrypoint: `backend/src/index.ts`
  - Modules menu endpoint: `GET /api/v1/modules` (static, should not depend on DB)
  - Customers meta endpoint: `GET /api/v1/entities/customer/meta` (static, no DB)
  - Customers list endpoint: `GET /api/v1/entities/customer/list` (DB-backed)
- Frontend API forwarding (dev/preview): `frontend/src/hooks.server.ts`
  - Forwards `/api/*` to `API_ORIGIN` (default `http://127.0.0.1:3001`)
- Sidebar: `frontend/src/lib/components/AppSidebar.svelte`
- Customers page: `frontend/src/routes/(app)/customers/+page.svelte`

## Troubleshooting

- Sidebar is empty in dev:
  - Ensure backend is running on `http://127.0.0.1:3001`
  - Check `frontend/src/hooks.server.ts` forwarding and `API_ORIGIN` env var

## Using Cursor or other agents

- If you work **on the backend only**, open the `backend/` folder as the project:
  - The agent will use `backend/AGENTS.md`, `backend/CLAUDE.md`, `backend/.cursor/*`, `backend/docs/ai/*`.

- If you work **on the frontend only**, open the `frontend/` folder as the project:
  - The agent will use `frontend/AGENTS.md`, `frontend/CLAUDE.md`, `frontend/.cursor/*`, `frontend/docs/ai/*`.

- For a **full-stack view**, open this workspace folder:
  - The agent will see both subfolders and can combine context, still following the rules in each repo.

## Git, commit, push, and release (three repositories)

- **Run `git` in the repository that contains the files you changed.** Example: commits for `frontend/src/...` belong to the **frontend** repo (`cd frontend` first).
- **Do not assume** a single `git push` updates everything. Pushing the workspace root does **not** publish backend or frontend code.
- When the user asks to **release** / **ship** / **rilascia** work that touched multiple areas:
  - **Release (commit + push + follow team GitFlow: PR, merge, tag on `release/*` or `hotfix/*` as applicable) in every repo that has changes**—typically **backend**, **frontend**, and **workspace root** if root scripts or `WORKSPACE.md` changed.
  - If only one repo changed, scope git operations to that repo unless the user explicitly asks for all three.
- Agents should **state clearly** which repo each command targets when operating from a multi-folder workspace.

## GitFlow (team rule)

- Do not work directly on `main` or `develop`.
- If you are already on `feature/*`, `release/*`, or `hotfix/*`, the agent must **ask** whether to stay on that branch or open a new one for the task. If you stay on the current branch, **do not** debate whether the branch name “fits” the work.
- If you choose a **new** branch: the agent must **ask** whether to **close the previous branch first** (merge + delete) or leave it open; new `feature/*` / `release/*` branches always start from an **up-to-date `develop`**, and `hotfix/*` from an **up-to-date `main`** (`checkout` → `pull` → `checkout -b …`), unless you explicitly request otherwise.
- After a merge, delete the local and remote branch when you close out the flow.
