# Plan: DAL First Release 0.1.0 — Commit, GitFlow Release, NPM Publish

## Objective

1. Commit all DAL work and push to origin
2. Rename package from `@primebrick/dal` to `@primebrick/dal-pg` (future-proof for MSSQL/MariaDB/other DBs)
3. Configure CI for NPM publish (not just GitHub Packages)
4. Execute GitFlow release flow for version `0.1.0`
5. Publish to NPM as public scoped package

## Current State (Analysis)

### Git
- **Branch**: `develop` (1 commit: "Initial commit" `040da6d`)
- **main**: exists but empty (only placeholder README)
- **Remote**: `origin https://github.com/michaelsogos/primebrick-v3-dal.git`
- **Untracked**: ALL source files (src/, test/, docs/, .devin/, .github/, scripts/, etc.)
- **Modified**: `README.md` (expanded from placeholder to full docs)
- **No tags exist yet**

### Package
- **Name**: `@primebrick/dal` ← needs rename to `@primebrick/dal-pg`
- **Version**: `0.1.0`
- **License**: MIT
- **Author**: Michael Sogos
- **Registry**: GitHub Packages (`.npmrc` → `@primebrick:registry=https://npm.pkg.github.com`)
- **Exports**: `.` and `./errors` subpaths

### CI
- **ci.yml**: build + typecheck on push to develop/main and PRs. No tests (needs PostgreSQL).
- **release.yml**: triggers on tag `[0-9]+.[0-9]+.[0-9]+`, publishes to GitHub Packages only.

### GitFlow
- Documented in `docs/gitflow.md`
- Release flow: `release/X.Y.Z` branch → version-sync → commit → merge to main → tag → push → CI publishes
- No `v` prefix on tags

### NPM
- `@primebrick/dal` → 404 (not taken)
- `@primebrick/dal-pg` → 404 (not taken)
- No `@primebrick` organization exists on npmjs.com yet (user must create it)

## Decisions

### D1: Package Name — `@primebrick/dal-pg`

**Rationale**: npm package names cannot have nested slashes beyond the scope. `@primebrick/dal/pg` is NOT a valid npm name. The correct convention is:

| Package | DB | Status |
|---------|----|--------|
| `@primebrick/dal-pg` | PostgreSQL | This release |
| `@primebrick/dal-mssql` | SQL Server | Future |
| `@primebrick/dal-mariadb` | MariaDB | Future |
| `@primebrick/dal-mysql` | MySQL | Future |
| `@primebrick/dal-sqlite` | SQLite | Future |

This follows the npm convention for scoped packages (`@scope/package-name`) and makes it clear each package is a DAL for a specific database.

**Import paths remain clean**: `import { Repository } from "@primebrick/dal-pg"`

### D2: Publish to NPM (not just GitHub Packages)

**Current**: `.npmrc` points `@primebrick` scope to GitHub Packages.
**Target**: Publish to npmjs.com as **public** scoped package.

**Why**: User wants the library usable by non-Primebrick projects. GitHub Packages requires authentication even for public packages. NPM public scoped packages are installable by anyone without auth.

**Changes needed**:
- Remove `.npmrc` (or change it to point to npmjs.com)
- `release.yml`: change `registry-url` to `https://registry.npmjs.org`
- `release.yml`: add `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` (user must create NPM token)
- `package.json`: add `"publishConfig": { "access": "public" }`

### D3: NPM Organization

User must create `@primebrick` organization on npmjs.com before publish.
- URL: https://www.npmjs.com/org/create
- Org name: `primebrick`
- This is a **manual user action** — cannot be automated.

### D4: NPM Token for CI

User must create an NPM access token (automation or publish type) and add it as a GitHub secret:
- URL: https://www.npmjs.com/settings/~/tokens
- Token type: **Automation** (or **Publish** if 2FA is enabled on the account)
- GitHub secret name: `NPM_TOKEN`
- Add to: https://github.com/michaelsogos/primebrick-v3-dal/settings/secrets/actions
- This is a **manual user action** — cannot be automated.

### D5: CI — Build + Typecheck Only (No Tests)

Current CI builds + typechecks. **Tests are NOT run in CI** because they require a real PostgreSQL instance.

**Rationale**: Tests need a live PostgreSQL DB. External CI environments (GitHub Actions, build pipelines) may not have PostgreSQL available. Running tests in CI without a DB would fail the build.

**Strategy**:
- `pnpm run build` = `tsc` only (compilation, no tests) — safe to run anywhere
- `pnpm test` = `vitest run` (integration tests, requires PostgreSQL) — run manually or in dedicated CI with DB
- `pnpm test:benchmark` = benchmarks (requires PostgreSQL, run manually)
- CI on GitHub Actions: build + typecheck only
- **Future**: dedicated CI workflow with PostgreSQL service container when needed

**No changes to ci.yml** — it already does build + typecheck only, which is correct.

### D6: Version stays 0.1.0

The package.json already has `0.1.0`. The release branch will be `release/0.1.0`. The version-sync script will confirm it matches.

## Execution Plan

### Phase 1: Package Rename + Config Changes (on develop)

**Files to modify**:

1. **`package.json`**:
   - `"name": "@primebrick/dal-pg"` (was `@primebrick/dal`)
   - Add `"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org" }`
   - Update `"description"` to mention PostgreSQL explicitly

2. **`.npmrc`**: Delete or replace with:
   ```
   # @primebrick packages published to npmjs.com (public)
   # No custom registry needed — npmjs.com is the default
   ```

3. **`release.yml`**: Update publish step:
   ```yaml
   - name: Setup Node.js
     uses: actions/setup-node@v4
     with:
       node-version: 22
       registry-url: https://registry.npmjs.org

   - name: Publish to NPM
     run: npm publish --access public
     env:
       NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
   ```

4. **`ci.yml`**: No changes needed. Already does build + typecheck only, which is correct since tests require PostgreSQL.

5. **`README.md`**: Update title to `@primebrick/dal-pg`

6. **`AGENTS.md`**: Update references from `@primebrick/dal` to `@primebrick/dal-pg`

7. **`docs/ai/dal-*.md`**: Update package name references

8. **`docs/skills/dal-usage.md`**: Update package name references

9. **`src/index.ts`**: Check if package name is referenced anywhere in source

10. **`.devin/skills/dal-usage/SKILL.md`**: Update references

### Phase 2: Commit on develop

Since ALL files are untracked (except README.md which is modified), this is the initial real commit.

```bash
git add -A
git commit -m "feat: @primebrick/dal-pg — type-driven PostgreSQL DAL with Repository, bulk ops, streaming, audit

- Metadata-based entity decorators (@Entity, @Column, @Key, @Unique, @AuditableField, @DeletableField)
- Type-safe Repository: CRUD, finders, bulk add/update/upsert/delete with TEMP TABLE strategy
- Streaming via pg-query-stream with dedicated client
- Audit-aware: created_at/created_by/updated_at/updated_by/version on all writes
- Soft-delete with deletedRecords EXCLUDED/ONLY/INCLUDED filter
- snake_case everywhere, RETURNING * on all writes
- 90 integration tests + benchmark suite (100/1K/10K scales)
- CI: build + typecheck + PostgreSQL integration tests
- Release: GitFlow with NPM publish on tag

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
git push origin develop
```

### Phase 3: GitFlow Release 0.1.0

Follow `docs/gitflow.md`:

```bash
# 1. Create release branch from develop
git checkout -b release/0.1.0

# 2. Version sync (package.json already at 0.1.0, but run to confirm)
pnpm run version:auto

# 3. If version-sync changed package.json, commit it
# (should be no-op since already 0.1.0)

# 4. Merge to main
git checkout main
git merge --no-ff release/0.1.0 -m "release: 0.1.0"

# 5. Tag
git tag 0.1.0

# 6. Push main + tags
git push origin main --tags

# 7. Merge main back to develop
git checkout develop
git merge --no-ff main -m "back-merge: main to develop after 0.1.0"

# 8. Push develop
git push origin develop

# 9. Delete release branch
git branch -d release/0.1.0
git push origin --delete release/0.1.0
```

### Phase 4: CI Triggers on Tag

When tag `0.1.0` is pushed:
1. `ci.yml` runs on main (build + typecheck + test)
2. `release.yml` runs on tag `0.1.0` (build + publish to NPM)

**Prerequisite**: User must have:
- Created `@primebrick` org on npmjs.com
- Created NPM automation token
- Added `NPM_TOKEN` secret to GitHub repo settings

If these are not done, the publish step will fail. The build/test will still pass.

### Phase 5: Verify

- Check GitHub Actions tab for CI status
- Check https://www.npmjs.com/package/@primebrick/dal-pg for published package
- Test install: `pnpm add @primebrick/dal-pg` in a temp project

## Manual User Actions (CANNOT be automated)

1. **Create NPM organization**: https://www.npmjs.com/org/create → org name `primebrick`
2. **Create NPM token**: https://www.npmjs.com/settings/~/tokens → type "Automation"
3. **Add GitHub secret**: https://github.com/michaelsogos/primebrick-v3-dal/settings/secrets/actions → name `NPM_TOKEN`, value = token

## Risk: NPM org/token not ready

If the user hasn't created the NPM org + token when we push the tag:
- CI build + test will PASS
- CI publish will FAIL (401 or 404)
- The tag will be on GitHub but no package on NPM
- Fix: create org + token, then re-run the release workflow from GitHub Actions UI

## Acceptance Criteria

- [ ] All source files committed on develop
- [ ] Package renamed to `@primebrick/dal-pg`
- [ ] CI updated: NPM publish (build + typecheck only, no tests in CI — tests need PostgreSQL)
- [ ] GitFlow release 0.1.0 completed (tag pushed)
- [ ] CI green on tag (build + typecheck + test pass)
- [ ] NPM publish succeeds (after user creates org + token)
- [ ] `pnpm add @primebrick/dal-pg` works in external project
