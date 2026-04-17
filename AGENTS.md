# Workspace (meta) agent guide — Primebrick

This document applies when the **workspace root** (this folder) is the Cursor project—not `backend/` or `frontend/` alone.

**Documentation language:** All `*.md` files must use **English** for team-facing prose.

## What this repository is

- The **workspace / meta** repo holds convenience tooling: root `package.json` (e.g. `pnpm run dev` via `concurrently`), `WORKSPACE.md`, and `scripts/` where present.
- It does **not** contain application source code for the API or the UI. Those live in **separate Git repositories** checked out under `backend/` and `frontend/`.

## Multi-repo rules (critical)

- **Three independent Git repositories:** workspace root, `backend/`, `frontend/`. Each has its own `.git`, branches, and remotes.
- **Commits and pushes** target one repo at a time. Changing files under `backend/` requires `git` operations **inside `backend/`**, and similarly for `frontend/`.
- When the user asks to **release** / **ship** / **rilascia** work that spans the stack, **release each repo that has changes** (verify → commit → push → follow team GitFlow for merge/tag). Do not assume one push from this root updates the app repos.

## GitFlow (team rule)

- Do not work directly on `main` or `develop` on **this** repo without team agreement; same GitFlow conventions as backend/frontend unless the team defines otherwise for the meta repo.

## Further reading

- Human-oriented layout and clone instructions: `WORKSPACE.md`
- Backend agent guide: `backend/AGENTS.md` (when working in the backend repo)
- Frontend agent guide: `frontend/AGENTS.md` (when working in the frontend repo)
