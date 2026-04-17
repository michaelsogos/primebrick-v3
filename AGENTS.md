# Workspace (meta) agent guide — Primebrick

This document applies when the **workspace root** (this folder) is the Cursor project—not `backend/` or `frontend/` alone.

**Documentation language:** All `*.md` files must use **English** for team-facing prose.

## GitFlow — zero tolerance (agents)

- **Do not** perform edits or commits while checked out on **`develop` or `main`**. Create **`feature/<slug>`** first (`git fetch`, `git checkout develop`, `git pull`, `git checkout -b feature/…`).
- **Do not** push work that was committed directly on `develop`. Merge the **`feature/*`** branch into `develop`, then push.
- Vague instructions (*"push"*, *"close"*) **do not** override this. Only an **explicit** *"commit on `develop`"* / *"bypass GitFlow"* does. Authoritative detail: **`.cursor/rules/gitflow-guard.mdc`** (*Zero tolerance*).

## What this repository is

- The **workspace / meta** repo holds convenience tooling: root `package.json` (e.g. `pnpm run dev` via `concurrently`), `WORKSPACE.md`, and `scripts/` where present.
- It does **not** contain application source code for the API or the UI. Those live in **separate Git repositories** checked out under `backend/` and `frontend/`.

## Multi-repo rules (critical)

- **Three independent Git repositories:** workspace root, `backend/`, `frontend/`. Each has its own `.git`, branches, and remotes.
- **Commits and pushes** target one repo at a time. Changing files under `backend/` requires `git` operations **inside `backend/`**, and similarly for `frontend/`.

## “Release everything” / **rilascia tutto**

When the user says **rilascia tutto** or **release everything**, execute the **full GitFlow release completion** (not just `git push` on `develop`) in **all three** repos: **`backend/`**, **`frontend/`**, and **this workspace root**, with **versioning**, **`release/<version>` branch**, merge to **`main`**, **annotated tag `v<version>`**, merge back to **`develop`**, delete **`release/*`**.

Use the **same SemVer** for a coordinated release unless they say otherwise. Exact steps, version math, and hotfix vs release: **`.cursor/rules/gitflow-guard.mdc`**. Human-readable summary: **`WORKSPACE.md`** → section *“Release everything / rilascia tutto”*.

If **GitHub/GitLab branch protection** blocks direct pushes to `main`, stop and tell the user to complete merges/tags using whatever access they have (bypass, CI, etc.). **Pull requests are not the default workflow** here: integrate with **local `git merge` and `git push`** unless the user specifies otherwise.

## GitFlow (team rule)

- Same as backend/frontend: **do not commit** changes on **`main` or `develop`**; create **`feature/*`** from **`develop`** (or **`hotfix/*`** from **`main`**) before editing tracked files, unless the user explicitly overrides.
- **Before the first file edit in this repo:** if `git branch --show-current` is `develop` or `main`, run **`git checkout -b feature/<slug>`** first—see **`.cursor/rules/gitflow-guard.mdc`** → *Mandatory order*.

## Further reading

- Human-oriented layout and clone instructions: `WORKSPACE.md`
- Backend agent guide: `backend/AGENTS.md` (when working in the backend repo)
- Frontend agent guide: `frontend/AGENTS.md` (when working in the frontend repo)
