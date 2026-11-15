# HTTP bind host — IPv4 default, IPv6 opt-in

## Decision (user-approved: "ipv6 go, pretendo test empirici")

`server.listen(port)` with no host binds the `::` wildcard under Bun/Windows —
an IPv6 socket also accepting IPv4-mapped traffic, invisible to `netstat` IPv4
scans and exposed on every interface. Every dev service was on `[::1]`.

Policy (ONE implementation, `resolveHttpBindHost` in sdk `http-server.ts`):

- `http_bind_host` config_entries row wins (US only — opt-in for `::`, `::1`,
  `0.0.0.0`, LAN IP). No seed shipped: absent = platform default. Empty/blank
  rows count as absent — `listen(port, "")` would re-bind `::`.
  `config_entries.key` is a free UNIQUE string (no FK to a param catalog) —
  the row can be created via SQL or the config UI
  (`/system/settings/configurations/create`). If a seed is ever added it
  needs `system.settings.config.infra.http_bind_host.*` label/description
  translation rows.
- absent → `0.0.0.0` under `NODE_ENV=production` (containers/LB need reachable
  socket — IPv4 wildcard, never implicit IPv6); `127.0.0.1` otherwise.
- env-policy: no new env var — `NODE_ENV` is in the permitted platform set.
- BE binds BEFORE DB is reachable → config_entries unavailable →
  `resolveHttpBindHost()` platform default only.
- FE `vite.config.ts` → `server.host: '127.0.0.1'` (dev-only tool).

## Changes

| Repo | File | Change |
|---|---|---|
| sdk | `src/http/http-server.ts` | `HttpServerOptions.hostname`, `resolveHttpBindHost()`, `listen(port, host)`; `createHttpServer` now resolves after 'listening' (latent race: `server.address()` was null post-await) |
| sdk | `src/microservice/create-microservice.ts` | `hostname: resolveHttpBindHost(configLoader.get("http_bind_host"))` |
| sdk | `src/index.ts` | export `resolveHttpBindHost` |
| be | `src/index.ts` | `app.listen(port, resolveHttpBindHost())` |
| fe | `vite.config.ts` | `server.host: '127.0.0.1'` |
| sdk | `__tests__/http-server.test.ts` | +5 tests: helper matrix + empirical bind tests (IPv4-only default, ::1 opt-in, cross-stack unreachable) |

## Empirical evidence (live stack, 2026-11-09)

- sdk vitest `http-server.test.ts`: **12/12** — `server.address()` = `127.0.0.1`
  default / `::1` opt-in; `/health` 200 on bound stack, connection refused on
  the other.
- Live services (`bun --hot` watched workspace sdk → hot reload):
  `3003=200/000, 3004=503/000 (llm dep down — known), 3005=200/000,
  3006=200/000, 3007=200/000` → `ipv4/ipv6`.
- BE `3001`: `127.0.0.1` LISTENING. FE `5173`: `127.0.0.1` LISTENING.
- `netstat -p tcpv6` on stack ports: **zero IPv6 listeners**.

## Incident during rollout

`touch` on 4 US `src/index.ts` (to force watcher reload) killed the `bun
--hot` processes — hot reload did not survive the dist swap (hypothesis:
`pnpm build` rewrote `dist/` mid-flight and the watchers re-imported an
inconsistent module graph; their stdout lives in hidden terminals and the
`temp/*-dev.log` files are stale from Nov 4, so the crash line is
unrecoverable). Cold restart with the new dist is clean — all 4 booted
healthy on 127.0.0.1. CRM had already reloaded cleanly on the source edit.
