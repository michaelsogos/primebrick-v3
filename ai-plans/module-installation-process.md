# Module Installation Process — first-boot provisioning & runtime hardening

> Extracted from `schema-sovereignty.md` task 8 and related deferred items.
> The module-installation process does not exist yet: today services are
> started manually and provision their own schema at boot via the migration
> engine. This plan designs the governed install path (provision before
> start) and the phase-2 DB-level hardening that depends on it.

## Status: ⚪ TODO — Plan date: 2026-10-15

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Module manifest (`module.json` or package.json field): service code, version, owned schemas, required roles, NATS subjects footprint, capabilities. Consumed by installer, not invented at runtime | ⏳ not done | — | gateway packages already carry service metadata — align format |
| 2 | Installer (CLI or BE admin action): provisions PG schema + per-schema role `svc_<schema>`, grants CONNECT/USAGE/data rights only on owned schemas, writes secrets to secret engine, registers module + instance in `service_registry` | ⏳ not done | — | today `SERVICE_CODE`-based register self-provisions; installer must own schema/role creation before first boot — runtime services must never CREATE ROLE |
| 3 | Phase-2 DB-level hardening: per-schema roles `svc_<schema>` own exactly their schema; REVOKE data rights on `public`/`custom`/other service schemas for non-BE; BE keeps read+write on `public`/`custom`; extension types stay resolvable via `public` in `search_path` (type access ≠ data access) | ⏳ not done | — | original schema-sovereignty §6 — documented, optional rollout gated on this plan's tasks 1–2 |
| 4 | Secrets: role passwords minted by installer, stored in secret engine, rotated on redeploy; `DATABASE_URL` rendered per instance from secret store | ⏳ not done | — | today `DATABASE_URL` is a shared env var with full rights |
| 5 | Registry lifecycle on install/uninstall: install creates registry row `offline`; first heartbeat → `online`; uninstall = explicit admin action (deletes rows, optionally drops schema with confirmation) | ⏳ not done | — | schema-sovereignty task 6 already does stale→offline sweep; uninstall path missing |
| 6 | Acceptance: a fresh service install produces working domain traffic with zero manual DB steps; revoking `public` data rights doesn't break type resolution (`vector`, `ltree` etc. resolve via search_path but tables unreachable) | ⏳ not done | — | live verify |

---

## Background

- `service_registry` claims persist while rows exist; offline/stale never releases ownership — already enforced (schema-sovereignty).
- Runtime boot currently self-provisions schema via `primebrick-db apply` — the installer moves schema creation out of runtime into a governed step.
- Role hardening was deferred because creating roles at runtime from the service itself is a security antipattern — it must come from an installer with elevated credentials.
