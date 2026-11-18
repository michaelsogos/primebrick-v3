# Primebrick dev stack - starts BE, FE and the US microservices DETACHED,
# so the services survive the agent shell/session that launched them.
#
# Idempotent: a service whose port already listens is skipped (never a
# duplicate, never a migrated port - see docs/ai/dev-server.md rules).
# Logs land in primebrick-workspace/temp/logs/<service>.log.
#
# Run:  powershell -ExecutionPolicy Bypass -File scripts/dev-stack.ps1
$ErrorActionPreference = 'Stop'
$logDir = 'D:\git\primebrick\primebrick-workspace\temp\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$services = @(
  @{ name = 'be';          dir = 'D:\git\primebrick\primebrick-be-v3';             port = 3001 },
  @{ name = 'fe';          dir = 'D:\git\primebrick\primebrick-fe-v3';             port = 5173 },
  @{ name = 'emailsender'; dir = 'D:\git\primebrick\primebrick-us-v3\emailsender'; port = 3003 },
  @{ name = 'ai';          dir = 'D:\git\primebrick\primebrick-us-v3\ai';          port = 3004 },
  @{ name = 'webhook';     dir = 'D:\git\primebrick\primebrick-us-v3\webhook';     port = 3005 },
  @{ name = 'job-handler'; dir = 'D:\git\primebrick\primebrick-us-v3\job-handler'; port = 3006 },
  @{ name = 'crm';         dir = 'D:\git\primebrick\primebrick-us-v3\crm';         port = 3007 }
)

foreach ($s in $services) {
  $listening = Get-NetTCPConnection -LocalPort $s.port -State Listen -ErrorAction SilentlyContinue
  if ($listening) {
    Write-Host ("{0,-12} port {1} already listening - skipped" -f $s.name, $s.port)
    continue
  }
  $log = Join-Path $logDir "$($s.name).log"
  Start-Process cmd.exe -WindowStyle Hidden -ArgumentList '/c', "cd /d `"$($s.dir)`" && pnpm run dev > `"$log`" 2>&1"
  Write-Host ("{0,-12} started detached on :{1}  -> {2}" -f $s.name, $s.port, $log)
}
