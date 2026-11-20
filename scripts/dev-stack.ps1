# Primebrick dev stack — thin wrapper over dev-stack.mjs (the real manager).
#
# dev-stack.mjs is genuinely idempotent: per-service state files
# (temp/dev/<name>.json), a serialized lockfile, process-TREE kills via
# taskkill /T, and a `reap` command for untracked zombies. The previous
# version of this script spawned detached cmd trees and forgot their PIDs
# — repeated runs accumulated orphans that never died.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/dev-stack.ps1            # = start all
#   powershell -ExecutionPolicy Bypass -File scripts/dev-stack.ps1 status
#   powershell -ExecutionPolicy Bypass -File scripts/dev-stack.ps1 stop [names]
#   powershell -ExecutionPolicy Bypass -File scripts/dev-stack.ps1 reap
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Args) { $Args = @('start') }
& node (Join-Path $here 'dev-stack.mjs') @Args
exit $LASTEXITCODE
