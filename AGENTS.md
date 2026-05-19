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

## RBAC Permission System (Backend)

### Architecture

The backend uses a wildcard-based RBAC system with pattern matching:

- **Source of truth**: `Permission` enum in `backend/src/modules/auth/permissions.ts` defines all available permissions
- **Role mappings**: Stored in `role_mappings` table (columns: `idp_role`, `permissions` array, `is_admin` boolean)
- **Permission format**: Dot notation with wildcards (e.g., `customers.read.*`, `customers.read.single`)
- **Admin bypass**: Users with `is_admin=true` bypass all permission checks

### Permission Structure

Permissions follow the pattern: `module.action.granularity`

Examples:
- `customers.read.all` - List all customers
- `customers.read.single` - Read single customer
- `customers.read.audit` - Read customer audit trail
- `customers.create.single` - Create single customer
- `customers.create.bulk` - Bulk create customers
- `customers.update.single` - Update single customer
- `customers.update.bulk` - Bulk update customers
- `customers.delete.single` - Delete single customer
- `customers.delete.bulk` - Bulk delete customers
- `customers.restore.single` - Restore single customer
- `customers.restore.bulk` - Bulk restore customers
- `customers.duplicate.bulk` - Bulk duplicate customers
- `customers.export` - Export customers
- `modules.read.all` - List all modules

### Wildcard Support

- `customers.*` matches all customer permissions
- `customers.read.*` matches all customer read permissions
- `*` matches everything (equivalent to admin)

### Role Mappings (Casdoor Integration)

The system is integrated with Casdoor IDP. Role names must match Casdoor roles (snake_case):

- `administrators` - Admin role (`is_admin=true`, bypasses all checks)
- `collaborator` - Full access to customers (`permissions: ["customers.*"]`)
- `guest` - Read-only access (`permissions: ["customers.read.*"]`)

### Implementation Details

**Files:**
- `backend/src/modules/auth/permissions.ts` - Permission enum and pattern matching logic
- `backend/src/modules/auth/rbac.middleware.ts` - RBAC middleware with admin bypass
- `backend/src/modules/auth/auth.middleware.ts` - Auth middleware with permission expansion
- `backend/src/modules/auth/role-mapping-repo.ts` - Role mapping repository
- `backend/src/modules/auth/types.ts` - AuthUser type with `isAdmin` field

**Key functions:**
- `expandPermissions(roles, getRoleMappingFn)` - Returns `{ patterns, isAdmin }`
- `isPermissionGranted(userPermissions, requiredPermission)` - Pattern matching with wildcard support
- `matchesWildcard(pattern, permission)` - Converts wildcard to regex for matching

**RBAC Middleware Flow:**
1. Check if `req.user.isAdmin` is true → bypass all checks
2. For non-admin users, use pattern matching on `req.user.permissions`
3. Support both "any" (OR) and "all" (AND) modes

### Adding New Permissions

1. Add permission constant to `Permission` enum in `permissions.ts`
2. Use the permission in route handlers via `rbacHandler([Permission.NEW_PERMISSION])`
3. Update role mappings in database to grant the permission (or use wildcard)
4. No need to update `getAllPermissions` - source of truth is the enum

### Testing

When testing RBAC changes, ensure the role mapping cache is reloaded by restarting the backend server after database updates.
