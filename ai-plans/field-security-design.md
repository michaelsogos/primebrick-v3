# Field security — role-level field masking orthogonal to permissions

## Status: ⚪ TODO — Plan date: 2026-11-03 14:00 UTC / 15:00 CET

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Inventory: what exists today (masking, permissions, role model) | ✅ done | 2026-11-03 | part A |
| 2 | Design space: where the flag lives, what "masked" means per surface | ✅ done | 2026-11-03 | part B |
| 3 | Implementation shape + open decisions | ✅ done | 2026-11-03 | part C |
| 4 | Decide model + implement | ⏳ not done | — | awaiting review |

---

## Part A — What exists today (empirical)

**Masking today is ONE special case only**: `config_entries` rows of `type:"secret"` — the BE serializes `value → null` on read (`primebrick-v3-core/src/config-entry.ts:38-46`). Per-entity-row field masking does **not** exist anywhere.

**Display-only hints (not security)**:

- `MetaColumn.format:"secret"` (`entity-meta.ts:119`) — FE masks rendering (password dots); the VALUE still travels in the payload. Cosmetic.
- `searchable:false` — docs explicitly mention sensitive fields (entity-meta.ts:180) — UX hint, zero enforcement.
- `x_not_editable` (payload-map) — callable-schema flag, unrelated to entity rows.
- `required_permission` on `RowCustomAction` — action gating, client-side only.

**RBAC model** (`role_mappings` table, `be/src/modules/auth/role_mapping_entity.ts`):

```
idp_role (from JWT roles_path, case-sensitive) → { permissions: string[], is_admin: bool, label_key }
```

- `loadAllMappings()` → `Map<idp_role, {permissions, is_admin}>` — the auth middleware expands JWT roles into a permission set at request time.
- **Global auth epoch** bumped on role/permission writes — fire-time auth checkpoints compare cached snapshots (the freshness mechanism already exists and is the exact channel a field-security flag would ride).
- Casdoor is the IDP — `permissions[]` is Primebrick-local, never synced.

The user's requested shape — `User → Role → {Permissions (child), FieldSecurity (child)}` — maps naturally: **field-security becomes a second child collection on the same role_mapping row** (sibling of `permissions[]`), expanding through the identical middleware.

## Part B — Design space

### B1. Where the flag lives

| Option | Shape | Verdict |
|--------|-------|---------|
| `role_mappings.field_security: string[]` — patterns like `customers.email:read`, `*.ssn:*` | sibling of `permissions[]` on the same row | ✅ recommended — the user's stated model; reuses epoch bump, mapping UI, admin flag |
| New permission namespace (`field:customers.email:view` inside `permissions[]`) | reuse existing array | ⚠️ simpler but conflates "can do" with "can see" — loses orthogonality the user asked for |
| Separate `field_security_mappings` table | parallel entity | ⚠️ more joins at request time, second admin surface — no benefit over a column |

### B2. What "masked" means per surface — the hard part

A field-security flag on `entity.field` must mask **server-side**, every read path:

| Surface | Masking behavior |
|---------|------------------|
| `GET /entities/:e` list | field omitted from row OR `"•••"` placeholder (decide — omission breaks table cells; placeholder keeps layout) |
| `GET /entities/:e/:uuid` | same |
| `POST/PUT` write | masked field: writes REJECTED or ignored? (recommend: ignored-as-null fails silently; reject 403 is honest) |
| Search/filter on masked field | must NOT leak via `LIKE`/`ORDER BY` results — filter clause rejected, column excluded from `searchable` server-side |
| Entity meta (`/meta`) | column flagged `x_field_secured` → FE renders masked cell + locks the editor — honest UI, no fake empty values |
| NATS/event payloads | entity fields flowing into emitted events — masked fields must be stripped at publish (the `to` array question resurfaces) |
| Audit/deletion rows | audit fields themselves (`created_by` etc.) are candidate targets — policy needed |

### B3. Request-time mechanics

The auth middleware already produces the expanded permission set per request. Field-security rides the same object: `ctx.field_security: Set<"entity.field">` (or inverted — see C1). The DAL query layer (`DomainService`/`svc`) is the single enforcement point: projection drops/masks flagged columns before rows leave — FE never sees them (your stated requirement: "non scendono nel payload o scendono già offuscate").

### B4. Default semantics (decide)

| Model | Meaning | Risk |
|-------|---------|------|
| **Deny-by-default** on flagged fields: flag `entity.field` in role → that role CANNOT see it | flag = lock | intuitive, matches "enable/disable visibility on role" |
| **Grant** model: flag = the role MAY see it (everything else masked) | flag = unlock | safer for new fields, more admin work |
| **Min-permission** variant: `field_security` entry = `perm:entity.read_sensitive` gate — role sees field iff it ALSO holds that permission | hybrid | closest to your "(o altro flag... o permesso minimo)" — flag on role toggles which gate applies |

## Part C — Implementation shape

1. `role_mappings` + `field_security jsonb` column (patch) → same admin entity, same sync rules.
2. `loadAllMappings()` returns `{permissions, is_admin, field_security[]}` → middleware puts it on request ctx (no extra query).
3. Auth epoch bump already covers role_mapping writes — freshness free.
4. `MetaColumn` gets `field_secured?: boolean` + `field_security_flag?: string` declarations (metadata is source of truth — the DAL cross-checks declared-vs-requested flags, not ad-hoc strings).
5. DAL projection mask: flagged columns serialize `null`/placeholder unless ctx allows; write-path strips flagged fields from input (or 403 — decide).
6. Meta serve-time: flagged columns get `x_field_secured` so list cells render `•••` and form controls lock (no fake editable-empty field).
7. FE: masked cells + locked controls + "insufficient field access" hint — one shared cell decorator, not per-page.

**Open decisions for you:**
- Placeholder `null` vs literal `"•••"` in the wire payload (null is honest; placeholder is clearer UX).
- Write on masked field: silent-ignore vs 403.
- Deny-flag vs grant-flag default (B4).
- Does masking cover filter/search/sort paths (recommended: yes — else it's a side-channel leak).
- Event payloads: strip masked fields at emit (recommended) or document the exemption.
