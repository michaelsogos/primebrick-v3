# Devin Rule: Verify File Creation (Prevent Truncated Filename Bug)

## Trigger
- Applies AFTER every `write` tool call that creates a new file
- Applies after every `edit` tool call that creates a new file (via path that didn't exist before)

## The Problem
The GLM model has a streaming output bug where the `write` tool's `file_path` parameter
gets truncated character-by-character as it streams to the tool execution layer. Each
truncation creates a new file with the FULL content but a PARTIAL filename.

Example: writing `AGENTS.md` may also create `AG`, `AGENTS`, `AGEN` — all with the same
content as `AGENTS.md` but with truncated names.

## Mandatory Post-Write Verification

After EVERY `write` tool call, you MUST:

1. **Verify the target file exists with the EXACT filename** — use `read` or `exec` with
   `Test-Path` to confirm the file exists at the exact path you intended.

2. **Check for truncated siblings** — list the directory contents and verify no files
   exist whose names are prefixes of the target filename.

   Example: after writing `AGENTS.md`, check that `AG`, `AGEN`, `AGENT`, `AGENTS`
   do NOT exist in the same directory.

3. **Delete any truncated files immediately** — if truncated files are found, delete
   them with `Remove-Item` (PowerShell) or `rm` (Unix) before proceeding.

## Detection Rules

A file is a "truncated sibling" if:
- It is in the same directory as the target file
- Its name is a prefix of the target file's name (without extension)
- It has no extension, or has a partial extension (e.g. `.t` instead of `.ts`,
  `.m` instead of `.md`, `.config` instead of `.config.ts`)

## Examples

### Correct behavior after writing `vitest.config.ts`:
```
1. Write file → vitest.config.ts
2. List directory → see: vit, vitest, vitest.config, vitest.config.ts
3. Detect truncated: vit, vitest, vitest.config
4. Delete: vit, vitest, vitest.config
5. Verify: only vitest.config.ts remains
```

### Correct behavior after writing `package.json`:
```
1. Write file → package.json
2. List directory → see: package, package.json
3. Detect truncated: package
4. Delete: package
5. Verify: only package.json remains
```

## Enforcement
- AI agent MUST verify file creation after every `write` call
- AI agent MUST delete any truncated sibling files immediately
- AI agent MUST NOT proceed to the next task until truncated files are cleaned up
- AI agent MUST run the cleanup script periodically:
  `node D:\git\primebrick\temp\cleanup-fake-files.mjs <target-dir>`
  (with DELETE=1 to actually delete)
