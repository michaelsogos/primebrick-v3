# CRM migration completion — entities ex-novo + existing, all on new-arch

# ⚠️ TURN PROTOCOL — READ THIS BLOCK EVERY TURN. IT IS THE WORKFLOW.

Every turn, in this order, NO EXCEPTIONS:
1. Read this whole plan — this block IS the operative workflow.
2. Fill in DOC RECEIPTS below before any action (cite doc:line).
3. State of the world = VERIFICATION LEDGER, never your memory.
4. Execute only the declared scope. Anomaly → STOP → report, max 2 retries.
5. Output waits ≤30s. Beyond that = anomaly, not "still running".
6. Before closing: write verdict + ledger + next step into the plan.
7. Prova del 9: every state claim carries `file:line` — if you cannot
   cite it, you did not verify it, it is an assumption.

## DOC RECEIPTS (fill before acting)
| doc:line | what it says | how it applies this turn |
|---|---|---|
| primebrick-workspace/ai-plans/_template.md:1-17 | turn protocol — plan-first, ledger is truth, file:line citations | this plan exists because the CRM audit was started WITHOUT a plan (user correction 2026-11-27 — workflow violation, not to be repeated) |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-27 | inventory crm schema vs entities-route | data plane COMPLETE | 19 tables in `primebrick-us-v3/crm/db-meta/snapshot-database.json` — every one served: 16 explicit decls in `primebrick-us-v3/crm/src/controllers/http/entities-route.ts` (grep `entityName:`) + `sequence` builtin via dal-pg registry + `sequence_counters` internal + `config_entries` config-standard + translations gateway-owned; `customer_consent` read/audit-only BY DESIGN (entities-route.ts comment) | verify FE plane |
| 2026-11-27 | inventory FE surfaces | ONE hardcoded leftover | `primebrick-fe-v3/src/routes/(app)/crm/customers/+page.svelte` is the ONLY hardcoded crm page (find verified); remote bundle `primebrick-us-v3/crm/fe/src/` carries CustomerCreatePage.svelte + PipelinePage.svelte | task 1 |
| 2026-11-27 | check BE residue | none | `primebrick-be-v3/src/modules/crm` does not exist (ls verified) — monolith crm module fully gone | — |

## Status: 🟠 WIP — Plan date: 2026-11-27 / TOC session 8

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Audit `routes/(app)/crm/customers/+page.svelte` — what it renders, whether its features exist in the new-arch generic/remote surfaces; migrate or document as deliberate custom | ⏳ not done | — | the only hardcoded crm page left in FE |
| 2 | Inventory ex-novo entities still to CREATE (user: "prima creiamo tutte le ex-novo") — cross-check the campaign intent: which entities were planned but never created in CRM | ⏳ not done | — | user says existing ones should all be migrated — data-plane audit CONFIRMS (ledger row 1); ex-novo inventory still open |
| 3 | When 1+2 close: migration-completion verdict + user-guide/dev docs reconciliation | ⏳ not done | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Context — the stepwise wire-up campaign

The big-plan doctrine (user, 2026-11-27): everything moves to the new
microservice wire architecture in steps — JH was first, CRM is the current
step. CRM introduced many new entities; the campaign order is:

1. create the ex-novo entities directly in new-arch;
2. migrate the pre-existing ones — the user expects these ALL migrated
   already (data-plane audit confirms: every crm table is served in
   new-arch; see ledger).

Open question the user must answer or the audit must close: the ex-novo
creation inventory (task 2) — is there a list of planned-but-never-created
CRM entities? No master campaign plan file was found in ai-plans — if it
exists elsewhere, link it here.

---

## 2026-11-27 — THE REAL GAP (user correction: entities are MISSING = unreachable)

Lazy-audit verdict reversed: route existence is NOT user reachability.
`primebrick-us-v3/crm/src/nav-declaration.ts` declares exactly 2 dictDecl
leaves (customer_types, customer_link_types) + customers + pipeline —
while the service serves 16 entities. UNREACHABLE (served but no nav
leaf): company_dimension, consent_type, contact_type, account_kind,
customer_account, customer_consent, customer_contact, customer_link,
legal_form, local_address, local_address_type, marketing_qualification,
qualification. Sequences surface via builtinNavContributions (dal-pg) —
verify separately. TASK 2 REDEFINED: nav completion IS the migration
gap — every served entity needs its dictDecl leaf + label keys +
E2E verification of user-visible reachability.
