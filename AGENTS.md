# Workspace (meta) agent guide — Primebrick

Use this file when the **Cursor project root is this workspace folder**, not `backend/` or `frontend/` alone.

**Documentation language:** All `*.md` files must use **English** for team-facing prose.

## What this repository is

Convenience tooling: root `package.json` (e.g. `pnpm run dev` via `concurrently`), `WORKSPACE.md`, `scripts/`. **No** application source — that lives in separate repos under `backend/` and `frontend/`.

## Git and GitFlow

- **Three independent Git repositories** (meta, `backend/`, `frontend/`). Commit and push **in the repo that owns the files**.
- **All GitFlow rules:** **`.cursor/rules/gitflow-guard.mdc`** (branch before edit; never commit on `develop`/`main`; merge `feature/*` before push; coordinated release / *rilascia tutto*).

## Further reading

| Doc | Purpose |
|-----|---------|
| `WORKSPACE.md` | Clone layout, human workflow |
| `backend/AGENTS.md` | Backend agent entry (when working in API repo) |
| `frontend/AGENTS.md` | Frontend agent entry (when working in UI repo) |

If **GitHub/GitLab branch protection** blocks pushes to `main`, tell the user to finish merges/tags with whatever access they have. **Pull requests are not the default integration path** unless the user says otherwise — prefer local `git merge` + `git push`.
