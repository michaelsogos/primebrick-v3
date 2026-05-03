# AI AGENT INSTRUCTIONS - Primebrick Workspace

This is a **meta-workspace** for convenience tooling only. **No application code** lives here.

**Documentation language:** All `*.md` files must use **English** for team-facing prose.

## Repository structure

| Location | Contents |
|----------|----------|
| **This directory** | Meta repo: root `package.json`, `WORKSPACE.md`, scripts — **not** app source. |
| `backend/` | Primebrick API — **its own** `.git`. |
| `frontend/` | Primebrick UI — **its own** `.git`. |

## How to work with AI agents

**IMPORTANT:** Always work directly in the sub-repositories, not from this root folder.

- For backend work: Set your AI agent's working directory to `backend/`
- For frontend work: Set your AI agent's working directory to `frontend/`

Each sub-repository has its own `AGENTS.md` with complete instructions for that project.

## Why work directly in sub-repos?

- This root folder's `.gitignore` excludes `backend/` and `frontend/`
- AI agents cannot access project files when started from root
- Each repository is independently versioned and will be developed separately in the future

## Further reading

| Doc | Purpose |
|-----|---------|
| `WORKSPACE.md` | Clone layout, human workflow |
| `backend/AGENTS.md` | Backend agent entry (when working in API repo) |
| `frontend/AGENTS.md` | Frontend agent entry (when working in UI repo) |
