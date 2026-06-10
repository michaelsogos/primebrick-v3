# Plan: Standardize UUID to Display Name Joins for Auditable Entities

## Problem Statement

The users page table shows `created_by` with the UUID instead of the display name. The system should automatically convert UUID fields (created_by, updated_by, deleted_by) to their corresponding display names by joining with the `user_profiles` table using a regex-based guardrail pattern.

## Current State Analysis

### Existing Working Implementations

1. **customers_dal.ts** (Lines 682-702, 720-740):
   - Uses joins with aliases: `creator`, `updater`, `deleter`
   - Row type includes: `created_by_name?`, `updated_by_name?`, `deleted_by_name?`
   - Query-builder automatically adds display_name projections based on aliases

2. **user-profiles-dal.ts** (Lines 300-319):
   - `listUsers` method has joins set up correctly
   - Uses same pattern as customers_dal.ts

3. **organizations_dal.ts** (Lines 198-217):
   - `listOrganizations` method has joins set up correctly
   - Uses same pattern

### Guardrail Implementation

**query-builder.ts** (Lines 142-148):
```typescript
if (j.options?.castRightTo === 'uuid' || (colMeta?.castInJoin === 'uuid')) {
  // When casting to UUID, also cast the left side to UUID for comparison
  // This avoids "uuid = text" error
  onExpr = `${leftExpr} ~ '^[0-9a-fA-F-]{36}$' AND ${rightExpr} = ${leftExprWithCast}`;
} else {
  onExpr = `${rightExpr} = ${leftExprWithCast}`;
}
```

**query-builder.ts** (Lines 82-101):
```typescript
// Add projections for display_name fields from joined tables
// These are NOT in the base entity, they come from the joins
if (joins) {
  for (const j of joins) {
    if (j.alias) {
      // Map join alias to the corresponding field name
      // creator -> created_by_name
      // updater -> updated_by_name
      // deleter -> deleted_by_name
      let fieldName = '';
      if (j.alias === 'creator') fieldName = 'created_by_name';
      else if (j.alias === 'updater') fieldName = 'updated_by_name';
      else if (j.alias === 'deleter') fieldName = 'deleted_by_name';

      if (fieldName) {
        projections.push(`${quoteIdent(j.alias)}.display_name AS ${quoteIdent(fieldName)}`);
      }
    }
  }
}
```

### Audit Trail Implementation

**Empiric Schema Analysis**:
- **Main entity tables** (customers, user_profiles, organizations): have `created_by`, `updated_by`, `deleted_by` fields
- **Audit tables** (customers_audit, user_profiles_audit): have single `changed_by` field (not created_by/updated_by/deleted_by)

**customers_dal.ts** (Lines 920-922) - Audit table join:
```sql
LEFT JOIN public.user_profiles creator
  ON audit.changed_by ~ '^[0-9a-fA-F-]{36}$'
 AND creator.uuid::text = audit.changed_by
```

**customers_dal.ts** (Lines 682-702) - Main entity table joins:
```typescript
Join.on(
  field(UserProfileEntity, "uuid"),
  field(CustomerEntity, "created_by"),  // Main entity field
  "LEFT",
  { castRightTo: "text", castLeftTo: "text", alias: "creator" }
),
```

## Root Cause Analysis

**Empiric Investigation Results**:

1. **customers_dal.ts**:
   - `listCustomers` (line 627): HAS joins with aliases (creator, updater, deleter)
   - `getByUuid` (line 714): HAS joins with aliases
   - `streamAllCustomers` (line 838): **MISSING joins** - no user_profile joins
   - Row type includes: `created_by_name?`, `updated_by_name?`, `deleted_by_name?`

2. **user-profiles-dal.ts**:
   - `listUsers` (line 247): HAS joins with aliases
   - `getByUuid` (line 85): HAS joins with aliases
   - `getByIdpCode` (line 124): HAS joins with aliases
   - Row type includes: `created_by_name?`, `updated_by_name?`, `deleted_by_name?`

3. **organizations_dal.ts**:
   - `listOrganizations` (line 145): HAS joins with aliases
   - `getByUuid` (line 83): HAS joins with aliases
   - Row type includes: `created_by_name?`, `updated_by_name?`, `deleted_by_name?`

**Identified Issue**: The `streamAllCustomers` method in `customers_dal.ts` is missing the user_profile joins, which would cause UUIDs to be displayed instead of display names when streaming.

**Potential Additional Issues**:
- Frontend may not be using the `*_name` fields even when they are returned
- Need to verify if the query-builder projection logic is working correctly for all cases

## Proposed Solution

### Phase 1: Centralize Join Logic in Repository Layer

**Objective**: Create a reusable helper function in the Repository or a new utility module that automatically adds the necessary joins for any entity implementing `IAuditableEntity`.

#### 1.1 Create Utility Function

**File**: `src/db/repository/auditable-joins.ts` (new file)

```typescript
import { EntityClass } from "../../domain/entities/entity-meta.js";
import { UserProfileEntity } from "../../modules/auth/user_profile_entity.js";
import { Join, field } from "./dsl.js";

/**
 * Standard join configuration for auditable entities.
 * Automatically adds LEFT JOINs to user_profiles table for created_by, updated_by, deleted_by fields.
 * 
 * Uses regex guardrail pattern to only join when the field contains a valid UUID.
 * 
 * @returns Array of Join expressions for creator, updater, and deleter
 */
export function buildAuditableJoins(entity: EntityClass): ReturnType<typeof Join.on>[] {
  return [
    Join.on(
      field(UserProfileEntity, "uuid"),
      field(entity, "created_by" as any),
      "LEFT",
      { castRightTo: "text", castLeftTo: "text", alias: "creator" }
    ),
    Join.on(
      field(UserProfileEntity, "uuid"),
      field(entity, "updated_by" as any),
      "LEFT",
      { castRightTo: "text", castLeftTo: "text", alias: "updater" }
    ),
    Join.on(
      field(UserProfileEntity, "uuid"),
      field(entity, "deleted_by" as any),
      "LEFT",
      { castRightTo: "text", castLeftTo: "text", alias: "deleter" }
    ),
  ];
}

/**
 * Enhanced version that allows selective joins (e.g., only creator and updater)
 */
export function buildAuditableJoinsSelective(
  entity: EntityClass,
  options: {
    includeCreator?: boolean;
    includeUpdater?: boolean;
    includeDeleter?: boolean;
  } = {}
): ReturnType<typeof Join.on>[] {
  const joins: ReturnType<typeof Join.on>[] = [];
  const { includeCreator = true, includeUpdater = true, includeDeleter = true } = options;

  if (includeCreator) {
    joins.push(
      Join.on(
        field(UserProfileEntity, "uuid"),
        field(entity, "created_by" as any),
        "LEFT",
        { castRightTo: "text", castLeftTo: "text", alias: "creator" }
      )
    );
  }

  if (includeUpdater) {
    joins.push(
      Join.on(
        field(UserProfileEntity, "uuid"),
        field(entity, "updated_by" as any),
        "LEFT",
        { castRightTo: "text", castLeftTo: "text", alias: "updater" }
      )
    );
  }

  if (includeDeleter) {
    joins.push(
      Join.on(
        field(UserProfileEntity, "uuid"),
        field(entity, "deleted_by" as any),
        "LEFT",
        { castRightTo: "text", castLeftTo: "text", alias: "deleter" }
      )
    );
  }

  return joins;
}
```

#### 1.2 Update Query Builder to Support Automatic Joins

**File**: `src/db/repository/query-builder.ts`

Add a new option to FindOptions to automatically include auditable joins:

```typescript
// In types.ts (or at the top of query-builder.ts)
export interface FindOptions {
  filters?: FilterExpr[];
  sorting?: SortingExpr[];
  joins?: JoinExpr[];
  deletedRecords?: WithDeletedRecords;
  /** Automatically add auditable joins for IAuditableEntity implementations */
  includeAuditableJoins?: boolean;
}
```

Update `buildSelectQuery` to automatically add joins when `includeAuditableJoins` is true:

```typescript
// In buildSelectQuery function
if (options.includeAuditableJoins) {
  const auditableJoins = buildAuditableJoins(entity);
  if (!options.joins) {
    options.joins = [];
  }
  options.joins = [...options.joins, ...auditableJoins];
}
```

### Phase 2: Create Standard Row Type Helper

**Objective**: Create a TypeScript utility type to automatically add the display name fields to row types.

**File**: `src/db/repository/auditable-types.ts` (new file)

```typescript
/**
 * Adds display name fields to a row type for auditable entities.
 * Use this to type the result of queries that include auditable joins.
 */
export type WithAuditableDisplayNames<T> = T & {
  created_by_name?: string;
  updated_by_name?: string;
  deleted_by_name?: string;
};

/**
 * Adds only creator display name (for cases where you only need created_by)
 */
export type WithCreatorDisplayName<T> = T & {
  created_by_name?: string;
};
```

### Phase 3: Refactor Existing DAL Files

#### 3.1 Update customers_dal.ts

**Empiric Current State** (Lines 682-702 in listCustomers):
```typescript
joins: [
  Join.on(
    field(UserProfileEntity, "uuid"),
    field(CustomerEntity, "created_by"),
    "LEFT",
    { castRightTo: "text", castLeftTo: "text", alias: "creator" }
  ),
  Join.on(
    field(UserProfileEntity, "uuid"),
    field(CustomerEntity, "updated_by"),
    "LEFT",
    { castRightTo: "text", castLeftTo: "text", alias: "updater" }
  ),
  Join.on(
    field(UserProfileEntity, "uuid"),
    field(CustomerEntity, "deleted_by"),
    "LEFT",
    { castRightTo: "text", castLeftTo: "text", alias: "deleter" }
  ),
],
```

**Empiric Current State** (Lines 881-889 in streamAllCustomers):
```typescript
const result = await this.repo.findAll<CustomerDetailRow, CustomerDetailRow>(
  CustomerEntity,
  projectAllExceptId(),
  {
    filters: filters as any,
    sorting,
    deletedRecords: q.deleted_records as any
    // MISSING: joins parameter
  }
);
```

**After Refactoring**:
```typescript
import { buildAuditableJoins } from "../../db/repository/auditable-joins.js";
import { WithAuditableDisplayNames } from "../../db/repository/auditable-types.js";

// In listCustomers method (line 682):
joins: buildAuditableJoins(CustomerEntity),

// In getByUuid method (line 720):
joins: buildAuditableJoins(CustomerEntity),

// In streamAllCustomers method (line 881) - ADD MISSING JOINS:
const result = await this.repo.findAll<CustomerDetailRow, CustomerDetailRow>(
  CustomerEntity,
  projectAllExceptId(),
  {
    filters: filters as any,
    sorting,
    deletedRecords: q.deleted_records as any,
    joins: buildAuditableJoins(CustomerEntity)  // ADD THIS LINE
  }
);

// Update row type (line 139):
export type CustomerDetailRow = WithAuditableDisplayNames<{
  uuid: string;
  code: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  email?: string;
  phone?: string;
  status: CustomerStatus;
  status_reason?: string;
  local_address?: string;
  local_city?: string;
  local_state?: string;
  local_country?: string;
  local_zip?: string;
  onboarding_at?: Date;
  onboarding_time_zone?: string;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  updated_by: string;
  version: number;
  deleted_at?: Date;
  deleted_by?: string;
}>;
```

#### 3.2 Update user-profiles-dal.ts

**Empiric Current State** (Lines 300-319 in listUsers):
```typescript
joins: [
  Join.on(
    field(UserProfileEntity, "uuid"),
    field(UserProfileEntity, "created_by"),
    "LEFT",
    { castRightTo: "text", castLeftTo: "text", alias: "creator" }
  ),
  Join.on(
    field(UserProfileEntity, "uuid"),
    field(UserProfileEntity, "updated_by"),
    "LEFT",
    { castRightTo: "text", castLeftTo: "text", alias: "updater" }
  ),
  Join.on(
    field(UserProfileEntity, "uuid"),
    field(UserProfileEntity, "deleted_by"),
    "LEFT",
    { castRightTo: "text", castLeftTo: "text", alias: "deleter" }
  ),
],
```

**After Refactoring**:
```typescript
import { buildAuditableJoins } from "../../db/repository/auditable-joins.js";
import { WithAuditableDisplayNames } from "../../db/repository/auditable-types.js";

// In listUsers method (line 300):
joins: buildAuditableJoins(UserProfileEntity),

// In getByUuid method (line 91):
joins: buildAuditableJoins(UserProfileEntity),

// In getByIdpCode method (line 130):
joins: buildAuditableJoins(UserProfileEntity),

// Update row type (line 11):
export type UserProfileDetailRow = WithAuditableDisplayNames<{
  uuid: string;
  idp_code: string;
  email?: string;
  display_name?: string;
  avatar_color?: string;
  avatar_initials?: string;
  is_active: boolean;
  is_admin: boolean;
  is_verified: boolean;
  email_verified: boolean;
  issuer?: string;
  roles?: string[];
  last_synced_at?: Date;
  idp_org?: string;
  idp_username?: string;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  updated_by: string;
  version: number;
  deleted_at?: Date;
  deleted_by?: string;
}>;
```

#### 3.3 Update organizations_dal.ts

**Empiric Current State** (Lines 198-217 in listOrganizations):
```typescript
joins: [
  Join.on(
    field(UserProfileEntity, "uuid"),
    field(OrganizationEntity, "created_by"),
    "LEFT",
    { castRightTo: "text", castLeftTo: "text", alias: "creator" }
  ),
  Join.on(
    field(UserProfileEntity, "uuid"),
    field(OrganizationEntity, "updated_by"),
    "LEFT",
    { castRightTo: "text", castLeftTo: "text", alias: "updater" }
  ),
  Join.on(
    field(UserProfileEntity, "uuid"),
    field(OrganizationEntity, "deleted_by"),
    "LEFT",
    { castRightTo: "text", castLeftTo: "text", alias: "deleter" }
  ),
],
```

**After Refactoring**:
```typescript
import { buildAuditableJoins } from "../../db/repository/auditable-joins.js";
import { WithAuditableDisplayNames } from "../../db/repository/auditable-types.js";

// In listOrganizations method (line 198):
joins: buildAuditableJoins(OrganizationEntity),

// In getByUuid method (line 89):
joins: buildAuditableJoins(OrganizationEntity),

// Update row type (line 14):
export type OrganizationDetailRow = WithAuditableDisplayNames<{
  uuid: string;
  idp_code: string;
  idp_owner?: string;
  idp_name?: string;
  display_name?: string;
  website_url?: string;
  last_synced_at?: Date;
  user_count?: number;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  updated_by: string;
  version: number;
  deleted_at?: Date;
  deleted_by?: string;
}>;

### Phase 4: Audit Trail Standardization

**Objective**: Create a helper function for audit trail queries that includes the display name join.

**Empiric Note**: Audit tables use a single `changed_by` field (not created_by/updated_by/deleted_by). This is different from main entity tables.

**File**: `src/db/repository/audit-join-helper.ts` (new file)

```typescript
/**
 * Returns the SQL fragment for joining user_profiles in audit trail queries.
 * Audit tables use 'changed_by' field (single field, not created_by/updated_by/deleted_by).
 * Uses the regex guardrail pattern to only join when changed_by is a UUID.
 */
export function getAuditUserJoinSql(): string {
  return `
    LEFT JOIN public.user_profiles creator
      ON audit.changed_by ~ '^[0-9a-fA-F-]{36}$'
     AND creator.uuid::text = audit.changed_by
  `;
}

/**
 * Returns the SELECT clause for audit queries including display name.
 * Audit tables use 'changed_by' field with 'changed_by_display_name' alias.
 */
export function getAuditSelectWithDisplayName(): string {
  return `
    audit.id,
    audit.entity_uuid,
    audit.action,
    audit.changed_at,
    audit.changed_by,
    creator.display_name as changed_by_display_name,
    creator.idp_code as changed_by_idp_code,
    audit.version,
    audit.delta
  `;
}
```

Update audit queries in:
- `customers_dal.ts` (getCustomerAudit method - lines 896-949)
- `user-profiles-dal.ts` (getUserProfileAudit method - lines 191-245)
- `organizations_dal.ts` (getOrganizationAudit method - if exists)

### Phase 5: Empiric Verification

#### 5.1 Test Customers List

```typescript
// Test that customers list returns display names
const result = await customersDal.listCustomers({ page: 1, page_size: 10 });
console.log('First row created_by:', result.rows[0].created_by);
console.log('First row created_by_name:', result.rows[0].created_by_name);
// Expected: created_by is UUID, created_by_name is display name or undefined
```

#### 5.2 Test Users List

```typescript
// Test that users list returns display names
const result = await userProfilesDal.listUsers({ page: 1, page_size: 10 });
console.log('First row created_by:', result.rows[0].created_by);
console.log('First row created_by_name:', result.rows[0].created_by_name);
// Expected: created_by is UUID, created_by_name is display name or undefined
```

#### 5.3 Test Audit Trail

```typescript
// Test that audit trail returns display names
const result = await customersDal.getCustomerAudit(customerUuid, 1, 10);
console.log('First audit changed_by:', result.data[0].changed_by);
console.log('First audit changed_by_display_name:', result.data[0].changed_by_display_name);
// Expected: changed_by is UUID or "system", changed_by_display_name is display name or undefined
```

### Phase 6: Documentation

**File**: `src/db/repository/README.md` (new file)

```markdown
# Auditable Entity Joins

## Overview

Entities implementing `IAuditableEntity` have audit fields (created_by, updated_by, deleted_by) that store user UUIDs. To display human-readable names, these fields should be joined with the `user_profiles` table.

## Standard Usage

### Automatic Joins

For simple cases, use the `buildAuditableJoins` helper:

```typescript
import { buildAuditableJoins } from "../../db/repository/auditable-joins.js";

const result = await repo.findByPage(
  MyEntity,
  page,
  page_size,
  null,
  {
    joins: buildAuditableJoins(MyEntity)
  }
);
```

### Selective Joins

If you only need specific joins (e.g., only creator):

```typescript
import { buildAuditableJoinsSelective } from "../../db/repository/auditable-joins.js";

const result = await repo.findByPage(
  MyEntity,
  page,
  page_size,
  null,
  {
    joins: buildAuditableJoinsSelective(MyEntity, {
      includeCreator: true,
      includeUpdater: false,
      includeDeleter: false
    })
  }
);
```

### Type Safety

Use the `WithAuditableDisplayNames` type helper:

```typescript
import { WithAuditableDisplayNames } from "../../db/repository/auditable-types.ts";

export type MyEntityRow = WithAuditableDisplayNames<{
  uuid: string;
  created_by: string;
  updated_by: string;
  // ... other fields
}>;
```

## Guardrail Pattern

The join uses a regex pattern to ensure we only join when the field contains a valid UUID.

**For main entity tables** (created_by, updated_by, deleted_by):
```sql
LEFT JOIN public.user_profiles creator
  ON entity.created_by ~ '^[0-9a-fA-F-]{36}$'
 AND creator.uuid::text = entity.created_by
```

**For audit tables** (changed_by):
```sql
LEFT JOIN public.user_profiles creator
  ON audit.changed_by ~ '^[0-9a-fA-F-]{36}$'
 AND creator.uuid::text = audit.changed_by
```

This prevents errors when the field contains non-UUID values like "system".

## Audit Trail Queries

For audit trail queries, use the helper functions:

```typescript
import { getAuditUserJoinSql, getAuditSelectWithDisplayName } from "../../db/repository/audit-join-helper.js";

const query = `
  SELECT ${getAuditSelectWithDisplayName()}
  FROM public.my_entity_audit audit
  ${getAuditUserJoinSql()}
  WHERE audit.entity_uuid = $1
  ORDER BY audit.changed_at DESC
`;
```
```

## Implementation Order

1. **Phase 1**: Create utility functions (`auditable-joins.ts`, `auditable-types.ts`)
2. **Phase 2**: Update query-builder to support automatic joins
3. **Phase 3**: Refactor existing DAL files (customers, users, organizations)
4. **Phase 4**: Standardize audit trail queries
5. **Phase 5**: Empiric verification with test queries
6. **Phase 6**: Documentation

## Acceptance Criteria

- [ ] All DAL list/find methods for auditable entities use the centralized join helper
- [ ] Row types use the `WithAuditableDisplayNames` helper for type safety
- [ ] Audit trail queries use the standardized SQL helper
- [ ] Guardrail regex pattern is consistently applied across all joins
- [ ] Documentation is complete and examples are provided
- [ ] Empiric testing confirms display names are returned for all entities
- [ ] No regression in existing functionality

## Risk Mitigation

- **Breaking Changes**: None - this is a refactoring that maintains existing behavior
- **Performance**: The LEFT JOINs are already in place; this just centralizes the logic
- **Type Safety**: TypeScript helpers ensure compile-time checking of display name fields
- **Testing**: Empiric verification will be performed after each phase

## Files to Modify

### New Files
- `src/db/repository/auditable-joins.ts`
- `src/db/repository/auditable-types.ts`
- `src/db/repository/audit-join-helper.ts`
- `src/db/repository/README.md`

### Modified Files
- `src/db/repository/query-builder.ts` (add automatic join support)
- `src/db/repository/types.ts` (add includeAuditableJoins option)
- `src/modules/customers/customers_dal.ts` (use centralized helpers)
- `src/modules/auth/user-profiles-dal.ts` (use centralized helpers)
- `src/modules/auth/organizations_dal.ts` (use centralized helpers)

## Notes

- The regex pattern `^[0-9a-fA-F-]{36}$` is the standard UUID v4 format
- The cast to `text` is necessary because PostgreSQL doesn't allow direct UUID = text comparison
- The LEFT JOIN ensures that records with non-UUID values (like "system") are still returned
- The alias mapping (creator -> created_by_name) is handled by the query-builder

## Frontend Follow-up (Post-Backend Implementation)

**Reminder**: After completing the backend changes, investigate the frontend entity table component to ensure it:

1. Uses `created_by_name`, `updated_by_name`, `deleted_by_name` fields instead of UUID fields when displaying audit information
2. Has fallback logic to display the UUID when the display name is null/undefined (e.g., for "system" records)
3. Applies this pattern consistently across all entity table components (customers, users, organizations, etc.)

**Investigation Points**:
- Check the entity table component in `primebrick-fe-v3` for how it renders audit fields
- Verify if there's a utility function or component that handles UUID-to-display-name display logic
- Ensure the audit bar/footer in profile pages uses the display name fields

This frontend investigation should be done empirically by examining the actual Svelte components and their current implementation.
