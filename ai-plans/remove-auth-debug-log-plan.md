# Plan: Remove `[auth][DEBUG] Access token:` log

## Summary
Remove the leftover debug `console.log` in `auth.middleware.ts` that prints the
raw JWT access token on every authenticated request in STANDALONE mode. This
eliminates a security/PII concern (full token in plaintext logs) and reduces
log noise.

## Objective
- Delete the `console.log("[auth][DEBUG] Access token:", token);` line.
- No replacement log is added (verification failures are already logged in the
  `catch` branch at line 123).

## Impacted Files
- `primebrick-be-v3/src/modules/auth/auth.middleware.ts`
  - Line 120: remove the `console.log` statement.

## Architectural Changes
None. No signature, API, or shared-state changes. Authentication flow is
unchanged — only the debug side-effect is removed.

## Acceptance Criteria
- [ ] The line `console.log("[auth][DEBUG] Access token:", token);` no longer
      exists in `auth.middleware.ts`.
- [ ] `pnpm run build` succeeds with no new errors.
- [ ] No other files are modified.

## Verification
- `grep -n "Access token:" primebrick-be-v3/src/modules/auth/auth.middleware.ts`
  returns no matches.
- `pnpm run build` in `primebrick-be-v3/` completes cleanly.

## Risks / Considerations
- Trivial, single-line deletion. No behavioral risk.
- If future debugging needs token inspection, prefer logging only `jti` / `exp`
  behind a `LOG_LEVEL=debug` flag rather than the raw token.
