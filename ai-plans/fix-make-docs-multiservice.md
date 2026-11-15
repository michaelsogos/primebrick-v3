# Plan: Fix make-docs & docs-sync for multi-service US repo

## Problem

The `primebrick-us-v3` repo is a **multi-service monorepo**. Microservices live
in self-contained sub-folders (currently `emailsender/`, future ones to follow),
each with its own `src/` (routes, NATS handlers, OpenAPI, providers, entities),
`package.json`, `Dockerfile`, `db-meta/`, `terraform/`.

The current `make-docs` skill and `docs-sync-on-close.md` rule treat the repo as
a single flat project:

1. **Diff is repo-level** — `git diff <base>...HEAD` returns paths like
   `emailsender/src/server/providers-route.ts`, but the skill never groups
   changed files by their service sub-folder prefix, so it cannot tell WHICH
   microservice changed.
2. **User-facing criteria are generic and repo-level** — the list
   ("service registration, NATS patterns, OpenAPI scaffolding, ...") does not
   map diff paths to a specific service, so the agent cannot decide which doc
   page to touch.
3. **No per-service doc structure** — `docs/user-guide/_order.json` is empty
   (`pages: []`). There is no convention for per-service pages
   (e.g. `docs/user-guide/services/emailsender.mdx`), so even when a service
   changes, there is nowhere structured to write/update its docs.
4. **Result**: `/make-docs us` reports "No user-facing changes. Docs are
   current." even when a microservice's routes/NATS/OpenAPI changed, because
   the skill has no service-aware mapping.

## Affected files

| File | Change |
|------|--------|
| `primebrick-us-v3/.devin/skills/make-docs/SKILL.md` | Rewrite to be service-aware: detect changed service sub-folders from the diff, map each to per-service doc pages, apply the anti-rewrite check per service. |
| `primebrick-us-v3/.devin/rules/docs-sync-on-close.md` | Add the same service-aware grouping to the close-time sync procedure (Step 2 user-facing check + Step 3 anti-rewrite). |
| `primebrick-us-v3/.devin/rules/docs-user-guide.md` | Add a "Per-service page convention" section: one page per microservice under `docs/user-guide/services/<service>.mdx`, plus shared cross-service pages (overview, architecture, conventions). |
| `primebrick-us-v3/.devin/rules/docs-order.md` | Note that service pages live under the `services/` group in `_order.json`. |
| `primebrick-us-v3/docs/user-guide/_order.json` | Seed with the initial page order (overview + services/emailsender). |
| `primebrick-us-v3/docs/user-guide/services/emailsender.mdx` | (Optional in this plan) Create the initial emailsender page from current code, OR leave creation to the first real `/make-docs us` run after the skill is fixed. |

The workspace-level skill at `d:/git/primebrick/.devin/skills/make-docs/SKILL.md`
is NOT changed — it already delegates to the US repo correctly ("None
(conceptual docs)"). The fix is entirely within the US repo's own skill + rules.

## Design

### Service detection from diff

After computing `git diff <base>...HEAD --stat`, group changed file paths by
their top-level sub-folder. A sub-folder is a microservice iff it contains a
`package.json` with a `name` starting with `primebrick-` AND a `src/index.ts`
entry point. Everything else (`docs/`, `.devin/`, `scripts/`, `docker-templates/`,
`AGENTS.md`, root files) is "repo-level/shared".

```
changed services = unique top-level dirs of changed files that are microservices
shared changes   = changed files NOT under a microservice sub-folder
```

### Per-service user-facing file mapping

For EACH changed service, user-facing files are (paths relative to `<service>/`):

| Path pattern | Doc topic |
|--------------|-----------|
| `src/server/*-route.ts`, `src/server/openapi-route.ts` | HTTP routes & OpenAPI |
| `src/nats/handlers.ts`, `src/nats/types.ts` | NATS subjects & request/reply |
| `src/domain/entities/*.ts`, `src/domain/entities/registry.ts` | Entities & data model |
| `src/providers/*.ts` | Provider integrations |
| `src/services/*.ts` | Service actions |
| `src/adapters/*.ts` | SDK usage / adapter ports |
| `Dockerfile`, `docker-compose.dev.yml`, `.env.example` | Deployment & config |
| `db-meta/patches/*` | DB schema (only if API-affecting) |
| `src/index.ts` | Lifecycle / health / registration |

Shared/repo-level user-facing files (NOT under a service):

| Path pattern | Doc topic |
|--------------|-----------|
| `docker-templates/*` | Cross-service deployment |
| `scripts/*` (if it changes service scaffolding) | New service template |
| `.devin/rules/api-path-conventions.md` | API conventions (shared page) |

### Doc page structure

```
docs/user-guide/
  _order.json
  overview.mdx              # repo overview, microservices list, architecture
  architecture.mdx          # NATS bus, BE proxy, SDK lifecycle (shared)
  conventions.mdx           # API path conventions, data model rules (shared)
  services/
    emailsender.mdx         # one page per microservice
    <future-service>.mdx
```

`_order.json` example after seeding:
```json
{
  "pages": ["overview", "architecture", "conventions", "services/emailsender"]
}
```

### Skill flow (rewritten make-docs)

1. Detect branch + diff base (unchanged).
2. `git diff <base>...HEAD --stat`.
3. **Group changed paths by service sub-folder** (new). Identify changed
   services + shared changes.
4. If no changed services AND no shared user-facing changes → "No user-facing
   changes. Docs are current." STOP.
5. For each changed service: run the per-service user-facing file mapping →
   determine which topics changed.
6. Anti-rewrite check PER affected page (existing logic, applied per page).
7. Update/create the relevant `services/<service>.mdx` page(s) and/or shared
   pages. Update `_order.json` for any new page.
8. Report: which services changed, which topics, which pages updated/skipped/created.

### docs-sync-on-close update

Mirror the same service-grouping in Step 2 (user-facing check) and Step 3
(anti-rewrite) of `docs-sync-on-close.md`, so closing a feature branch that
touched `emailsender/` correctly updates `services/emailsender.mdx`.

## Acceptance criteria

1. Running `/make-docs us` after a change to `emailsender/src/server/providers-route.ts`
   detects `emailsender` as the changed service, identifies "HTTP routes &
   OpenAPI" as the changed topic, and updates/creates
   `docs/user-guide/services/emailsender.mdx` (or skips it if already accurate).
2. Running `/make-docs us` with no service changes and no shared user-facing
   changes still reports "No user-facing changes. Docs are current."
3. A change to `docker-templates/` (shared) updates the shared deployment
   section, not a per-service page.
4. `_order.json` is seeded with `overview`, `architecture`, `conventions`,
   `services/emailsender`.
5. `docs-sync-on-close.md` uses the same service-grouping logic.
6. No changes to the workspace-level make-docs skill.
7. The skill still respects the anti-rewrite principle: surgical edits, no
   full-page regeneration for guide pages.

## Out of scope

- Actually writing the prose content of `services/emailsender.mdx` (that happens
  on the first real `/make-docs us` run after the skill is fixed, OR can be done
  as a follow-up task).
- Changing the BE or FE make-docs flows (they are single-project repos).
- Adding extraction tooling to the US repo (still conceptual/prose docs).
