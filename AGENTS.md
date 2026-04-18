# Workspace (meta) agent guide — Primebrick

Use this file when the **Cursor project root is this workspace folder**, not `backend/` or `frontend/` alone.

**Documentation language:** All `*.md` files must use **English** for team-facing prose.

## What this repository is

Convenience tooling: root `package.json` (e.g. `pnpm run dev` via `concurrently`), `WORKSPACE.md`, `scripts/`. **No** application source — that lives in separate repos under `backend/` and `frontend/`.

## Git and GitFlow

- **Three independent Git repositories** (meta, `backend/`, `frontend/`). Commit and push **in the repo that owns the files**.
- **All GitFlow rules:** **`.cursor/rules/gitflow-guard.mdc`** (branch before edit; never commit on `develop`/`main`; merge `feature/*` before push; coordinated release / *rilascia tutto*).

## New task workflow (automatic feature slug)

When the user starts a fresh piece of work with phrases such as **“Let’s start a new task”**, **“Iniziamo un nuovo task”**, or equivalent (*new feature*, *nuova feature*, *start a task*), treat it as a **new GitFlow feature** in every repo that will receive edits:

1. **Infer a branch slug from context** — the current message, backlog items (`NEXT-SESSION.md`, issues), and recent chat. Do **not** use a generic name like `feature/work` or `feature/update`.
2. **Slug rules:** lowercase, `kebab-case`, ASCII letters/digits/hyphens only; short but specific (e.g. `iana-timezone`, `websocket-notifications`, `table-row-selection`). Prefer **2–5 words** joined by hyphens; avoid redundant prefixes like `feature-` inside the slug.
3. **Before the first tracked-file change** in each affected repo, ensure a branch `feature/<slug>` exists from **up-to-date `develop`** (see **`.cursor/rules/gitflow-guard.mdc`**). Use the **same** `<slug>` across backend/frontend/meta when the same task touches multiple repos, unless the user scopes work to one repo.
4. **State the slug once** in a single line (e.g. “Branch: `feature/iana-timezone`”) so the user can rename if needed before heavy edits.
5. If the goal is ambiguous, **ask one clarifying question** or propose **two slug options** instead of guessing a vague slug.

Nested repos: follow **`backend/AGENTS.md`** and **`frontend/AGENTS.md`** for repo-specific commands; GitFlow and this workflow apply the same way inside each `.git` root.

## Further reading

| Doc | Purpose |
|-----|---------|
| `WORKSPACE.md` | Clone layout, human workflow |
| `NEXT-SESSION.md` | Backlog memo (may inform task slugs; not team-facing spec) |
| `backend/AGENTS.md` | Backend agent entry (when working in API repo) |
| `frontend/AGENTS.md` | Frontend agent entry (when working in UI repo) |

If **GitHub/GitLab branch protection** blocks pushes to `main`, tell the user to finish merges/tags with whatever access they have. **Pull requests are not the default integration path** unless the user says otherwise — prefer local `git merge` + `git push`.
