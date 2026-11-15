# CRM — org_accounts (legal entity of a tenant) + customer commercial competence + tenancy axis

> Sibling plan of `crm-customer-model-local-address.md` (customer-model
> authority). Requested 2026-11-08 by the user — anticipates a future
> **tenancy isolation** macro-task and the future **billing** module:
> "per generare una fattura serve sapere quale ENTITÀ LEGALE emette —
> org↔org_account come customer↔customer_account — e customer_account ha
> una relazione con org_account per definire il DEFAULT invoice emitter".
> Also: "ogni customer deve avere un onboarding flag e un owner (utente)
> — le competenze commerciali: di chi è il customer, di quale org, e la
> competenza di fatturazione, chi fattura a chi e come".
> Cross-org collaboration (opportunity su un customer altrui) is the
> stated reason the axis must be explicit, not implied.

## Status: ⚪ TODO — Plan date: 2026-11-08 — awaiting user decisions on Q1–Q10 before any task starts

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Decisions Q1–Q10 (below) — user call, nothing is implemented before | ⏳ not done | — | The whole plan is gated on these |
| 2 | `organization_accounts` entity + db patch + meta + service + route + permissions + i18n seeds | ⏳ not done | — | Placement decided by Q1/Q3; shape decided by Q2/Q9 |
| 3 | `customer_accounts.org_account_uuid` + `customer.owner_user_uuid` + `customer.organization_uuid` + onboarding flag | ⏳ not done | — | One additive patch; flags/refs decided by Q4–Q7 |
| 4 | FE: meta/list-config ref columns + cells (org_account picker, owner picker, org display) + dict/labels i18n | ⏳ not done | — | Lazy `ref:` convention; user picker = which widget? (Q5 note) |
| 5 | Backfill strategy for existing rows (single-tenant dev DB) | ⏳ not done | — | Q8 |
| 6 | Seeds + translations (entity labels ×7 langs, nav if org_accounts gets a page) | ⏳ not done | — | Which schema owns the keys — follow entity owner |
| 7 | Verify: db:check clean, service boot, svelte-check, E2E | ⏳ not done | — | |
| 8 | Forward notes → tenancy-isolation macro-task + `opportunity` entity + billing module (recorded, NOT this plan) | ⏳ not done | — | §"Forward workstreams" |

---

## Verified current state (2026-11-08)

| Fact | Evidence |
|---|---|
| `organizations` (public, BE-owned) = Casdoor-mirrored **tenant** registry: `uuid` (internal), `idp_code`, `display_name`, `idp_owner`, `idp_name`, `website_url`, `avatar`. **No legal/fiscal identity, no country, no hierarchy.** | `be-v3/src/modules/auth/organization_entity.ts` |
| `user_profiles` (public): `uuid` is THE internal user reference surfaced via API (audit fields, joins). | `user_profile_entity.ts` docblock |
| `customer` (crm): has `onboarding_at` + `onboarding_time_zone` (timestamp+tz, not a flag). **No owner, no org link.** | `customer_entity.ts` |
| `customer_accounts` (crm): flattened fiscal datasheet — `customer_id`, `kind_uuid`→`account_kinds` dict, `company_name`, `legal_form_uuid`→`legal_forms` (ISO 20275), `country`, `local_address_id`, `contact_id`, `is_default`. **No emitter/org ref.** | `customer_account_entity.ts` |
| Lazy meta `ref: {entity}` is the established cross-entity reference convention (uuid column + ref-combo + i18n label). | `customer_accounts/list-config.ts:36` |
| `legal_forms` dict lives in the **crm** schema (ISO 20275 seeded, universal data) — an org-side legal form would reference a crm-owned dict. | `legal_form_entity.ts` |
| `is_admin`/`access.*`/permission grants exist per role; `user_profiles.idp_org` ties users to an org (Casdoor org name, not uuid). | `role_mappings`, `organizations` |

---

## Proposed model (every item flagged PROPOSED — nothing final until Q-decisions)

### `organization_accounts` — the tenant's legal entity (emittitore)

One org → N accounts (N-1, `is_default` semantics like customer_accounts).
Mirror shape of `customer_accounts`:

- `organization_id` / `organization_uuid` → organizations
- `company_name` (ragione sociale), `legal_form_uuid`, `country` (jurisdiction)
- fiscal identifiers (VAT, tax code — Q2)
- registered address/contact (Q2 — orgs have no local_addresses today)
- `is_default` — the org's default emitter

**Purpose**: the billing module resolves "who issues this invoice" from an
org_account row, never from the org mirror row (which is Casdoor-synced,
not user-curated).

### `customer_accounts.org_account_uuid` — default invoice emitter

- `org_account_uuid` (uuid, nullable, lazy `ref: {entity: 'organization_account'}`)
- Semantics: the emitter for invoices issued TO this customer through this
  billing account ("chi fattura a chi"). Resolution chain for billing:
  `customer_accounts.org_account_uuid` → fallback `organizations`' default
  org_account (Q7).

### `customer` competence fields

- `owner_user_uuid` → `user_profiles.uuid` — the commercial owner
  ("di chi è il customer")
- `organization_uuid` → `organizations.uuid` — the home tenant
  ("di quale org"; THE tenancy axis for the future isolation task)
- onboarding flag — `onboarding_at` already stores the instant; the "flag"
  semantics need Q6 (boolean? status? derivation from qualification?)

---

## Open questions — user decisions required

| # | Question | Lean |
|---|---|---|
| Q1 | **Where does `organization_accounts` live?** `public` (BE-owned, next to `organizations` — platform tenancy/billing axis, any service can ref it via lazy meta ref + ENTITY_SERVICE_MAP) vs `crm` (it "feels" CRM-ish but billing/tenancy are platform concerns and `organizations` is already public). | **public + BE-served** — billing is not a CRM-internal concern, and a crm-owned entity would force every consumer (billing, future modules) to depend on the crm service for platform data. |
| Q2 | **Fields beyond the mirror?** Which fiscal identifiers does billing need now (VAT number, tax code, registered office)? And: registered address/contact — orgs have no `local_addresses`/`contacts` normalization; flat columns on org_accounts vs creating org-side address/contact children later? | Minimal viable: mirror + `vat_number`, `tax_code` (nullable) + flat `registered_address` text for now; normalize if a second consumer appears. |
| Q3 | **`legal_form_uuid` ref points at `crm.legal_forms`** (ISO 20275 — universal, but crm-owned). Options: (a) accept the cross-schema lazy ref (works — refs resolve by entity name, not schema), (b) promote `legal_forms` to a platform/public dict (migration + re-seed). | (a) accept — the dict stays crm-owned until a platform dict layer exists; document the cross-schema ref. |
| Q4 | **`customer.organization_uuid` — single home-org?** Or N-N via a share/link entity for multi-org visibility from day one? | Single `organization_uuid` (isolation anchor = ONE home tenant) + cross-org collaboration through `opportunity`/future share entity — "non serve sdoppiare" means the customer is not duplicated, the opportunity is the collaboration vehicle. |
| Q5 | **`owner_user_uuid` single field?** Or an assignments/owners child entity (teams, history, shared ownership)? | Single field now (the stated need: "owner inteso come utente e quindi una competenza"); a `customer_owners` child is a later axis if teams emerge. |
| Q6 | **Onboarding flag semantics** — `onboarding_at` timestamp already exists. Add `onboarding_completed` boolean? A status (`onboarding_status` dict-ref)? Or is "onboarded" derived from `qualification_uuid` stage? | Ask the user what the flag DRIVES (gate? badge? filter?) before choosing shape — don't add a redundant boolean if derivation suffices. |
| Q7 | **Emitter resolution** — `customer_accounts.org_account_uuid` NULL = fall back to the org's `is_default` org_account? Or mandatory when kind=invoice? | Fallback to org default (nullable, honest); the billing module resolves the chain at invoice time. |
| Q8 | **Backfill** — existing customers/accounts: which org/owner? Dev DB is single-tenant (ACME Test) — backfill `organization_uuid` to the existing org, `owner_user_uuid` to `created_by`'s user? | Backfill org=the single existing org, owner=created_by (documented, reversible). |
| Q9 | **Naming** — `organization_accounts` (full-name convention like `customer_accounts`) vs `orgs_accounts` (user's phrasing)? | `organization_accounts` — convention wins unless overridden. |
| Q10 | **`opportunity` entity** — separate plan or this one? | Separate workstream (its own plan) — this plan only fixes the axes it needs (`organization_uuid`, `owner_user_uuid`). |

---

## Forward workstreams (recorded, NOT this plan's scope)

- **Tenancy isolation macro-task**: `organization_uuid` on customer is the
  anchor axis. Isolation machinery (query filters/RLS/route gates, share
  semantics, which entities carry the axis) is out of scope — this plan
  only guarantees the axis EXISTS and is populated.
- **`opportunity` entity**: cross-org collaboration vehicle — needs this
  plan's axes; its design is a separate plan (it also answers "shared
  visibility without duplicating the customer").
- **Billing module**: consumes `organization_accounts` (emitter) +
  `customer_accounts.org_account_uuid` (default emitter per billing
  account) + "chi fattura a chi e come" (terms — likely on the account
  later, not modeled here).

## Non-goals

- No data isolation enforcement now (axis only).
- No org hierarchy modeling (orgs-by-country is data, not a tree — unless
  the user says otherwise).
- No billing terms/conditions fields on customer_accounts (billing scope).
- No changes to Casdoor sync (`organizations` stays a mirror — fiscal
  identity is Primebrick-owned by design).
