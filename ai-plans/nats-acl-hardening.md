---
id: nats-acl-hardening
title: NATS ACL hardening for jobs.cancel.* (and sibling ctl subjects)
status: open
created: 2026-11-05
owner: infra
---

# NATS ACL hardening — `jobs.cancel.*` raw publish is unauthenticated

Extracted from `fix-job-disable-must-kill-consumer` (OPEN-list item). This is
**infrastructure** (NATS server account/ACL config), not microservice code —
it lives here so it is not lost.

## Evidence

- `jobs.cancel.<owner>.<name>` is a plain publish subject consumed by
  job-handler's cancel lane. Today **any NATS client can publish a cancel**
  for any subject — there is no ACL binding the cancel subject to the
  declaring service's credentials.
- Same exposure class applies to other `jobs.ctl.*` / `jobs.due.*` subjects:
  authentication is implicit (whoever holds NATS credentials can publish),
  authorization-by-subject-namespace is not enforced at the server.
- Code-side mitigation exists: `dueLaneVerify` checks the publisher's
  static identity key and actor-claim presence on `jobs.due.*`. That gate is
  defense-in-depth — it does not replace server-side ACLs.

## Work (infra-side, when NATS is hardened for prod)

- [ ] NATS account/JWT permissions: restrict `jobs.cancel.*` publish to the
      job-handler credentials; restrict `jobs.schedule.*` publish to
      declaring-service credentials.
- [ ] Same pass for `auth.ctl.*`, `config.changed`, `service.gateway_online`
      broadcast subjects (publish side should be server-owned).
- [ ] Document the ACL matrix in the ops repo / deploy docs once enforced.

## Notes

- Verified live 2026-11-05: dev NATS allows anonymous publish on `jobs.cancel.*`.
- Do NOT solve in code with message-level signatures — that duplicates what
  the server already does with account JWTs; this belongs to deployment config.
