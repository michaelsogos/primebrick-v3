# ai-plans Conventions — Lifecycle, COMPLETED Rule, Drift Re-Homing

> Canonical normative doc for how plans are created, tracked, and closed in
> `primebrick-workspace/ai-plans/`. Referenced by workspace `AGENTS.md`
> ("Plan files") and `_template.md`. Every agent that creates or touches a
> plan file MUST follow this doc.

---

## 1. Where plans live and what they are

- All execution plans live in `primebrick-workspace/ai-plans/` — **never**
  inside a project repo. Repos stay self-contained; the workspace owns the
  planning memory.
- `ai-plans/COMPLETED/` is the archive. Only **fully done** plans move there.
- One file per workstream: `feature-*.md`, `fix-*.md`, `bugfix-*.md`,
  `<domain>-*.md`. File names are kebab-case and descriptive — the name must
  still make sense months later when nobody remembers the session.
- Header + task table format: `_template.md` — follow it exactly.

## 2. Status vocabulary — honesty is mandatory

| Marker | Meaning |
|---|---|
| ✅ done | Verified: tests run, live-checked, or evidence linked in the row. Not "should work". |
| ⏳ not done | Not started. |
| ⏳ partial | Started; the row's Notes state exactly what remains. |
| 🚫 dropped | Deliberately descoped — the row's Notes say WHY (design call, superseded). |
| ➡️ moved | Real residual re-homed to another open plan — the row's Notes name the target file. |

- **Never mark a task done on intention.** "The code is written" ≠ done —
  the row cites the commit/PR/test result or says why verification is pending.
- The header `## Status:` line must reflect the table's truth on every
  session that touches the file. A plan that says ⚪ TODO while half its
  rows are ✅ is **stale** — stale plans are defects, fix them on sight.

## 3. THE COMPLETED RULE

`COMPLETED/` is a **one-way archive of absolute closure**:

1. A plan enters `COMPLETED/` only when **100% of its scope is resolved** —
   zero ⏳, zero hidden residual work, zero "we'll get back to this".
2. **Nobody ever re-opens or re-reads a COMPLETED plan looking for work.**
   Whatever is written inside a completed file is dead: superseded by later
   plans, assumed final, never the source of a future task.
3. Therefore: **any note, flag, or task inside a plan that represents real
   future work MUST NOT reach `COMPLETED/`** — it would be silently lost.
   Such residuals are either re-homed (§4) or the plan stays open.
4. Informational history is fine: descoped alternatives, known limitations
   that need no action, verified-covered items, provenance lines. The test is
   *"is there anything here a future us should DO?"* — if yes, it doesn't
   belong in the archive.

## 4. Drift re-homing procedure (mandatory before archiving)

"Drift" = anything in a plan that is not fully resolved when the plan wants
to close: pending tasks, partial rows, residual flags, deferred items,
verification gaps.

**Step 1 — classify every unresolved row/note into exactly one bucket:**

| Bucket | Verdict | Action |
|---|---|---|
| **Done in reality** | work landed outside the plan's tracking | mark ✅ + cite evidence (commit/test/live check) |
| **Real residual** | future work still needed | **re-home** (below) |
| **Dead by decision** | deliberately descoped / alternative rejected | mark 🚫 or record "descoped — no residual" + reason |
| **Verified covered** | the need is already met elsewhere | record "verified covered" + where (file:line) |

**Step 2 — re-home every real residual:**

1. **Preferred: an open plan in the same domain** — append a row to its task
   table with provenance: `… | ⏳ not done | — | from <source-plan>#<task>: …`.
2. **No open plan fits: create a dedicated stub plan** — new
   `<domain>-<topic>.md` (⚪ TODO) that carries the residual scope, the
   context blockquote from the source plan, and cross-refs. A small honest
   stub is always better than lost work.
3. **Residuals outside any repo** (infra config, ops, prod hardening — e.g.
   NATS ACLs) get their own stub plan too — they still need to exist
   somewhere agents will find them.

**Step 3 — close the loop in the source plan:**

- Mark each re-homed row `➡️ moved` + target file name — provenance is
  preserved both directions.
- Update the header: `🟢 DONE — archived <date> (task N → <target>)`.
- `git mv` to `COMPLETED/`.

**Step 4 — final gate:** `grep ⏳ COMPLETED/<file>` must return nothing.
If it returns rows → the plan is not done; go back to step 1.

## 5. Parent/child and cross-reference conventions

- `> Continuation of \`<plan>.md\`` in the header when a plan continues a
  closed or ongoing workstream.
- `Related plans:` list in the header for domain siblings — always prefix
  archived ones with `COMPLETED/` so the path stays valid.
- When a child extracts scope from a parent, the parent's row gets
  `➡️ moved to <child>`; the child's header cites `Extracted from <parent>#<task>`.
- When a plan absorbs residual drift from a closing plan, its task table
  gains a row citing `from <closing-plan>#<task>`.

## 6. Per-session duties

1. **Update the task table** every time work lands — the table is the live
   ledger, not a post-hoc summary.
2. **Fix stale plans on sight**: header vs reality, task rows vs landed
   code. A plan that understates reality hides work; one that overstates
   it invents work. Both are defects.
3. **On plan closure**: run the full §4 procedure — never `git mv` a file
   that still carries unresolved rows.
4. **Commit plan changes** to the workspace repo as you go (the repo has a
   `plan(<scope>): …` commit convention).

## 7. Encoding & tooling

- Plan files are UTF-8 with emojis in status markers — **edit them only with
  file-edit tools**, never shell text replacement (`sed`, PowerShell
  `-replace`) which mangles non-ASCII bytes.
- `git mv` for moves (history preserved).
