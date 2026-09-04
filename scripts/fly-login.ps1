# Opens Fly.io browser login. Run in your VS Code / PowerShell terminal (not headless).
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "fly-utils.ps1")

$r = Invoke-Flyctl auth login
if ($r.ExitCode -eq 0) {
  $whoami = Get-FlyctlWhoami
  Write-Host "`nLogged in as: $whoami" -ForegroundColor Green
  Write-Host "`nNext: npm run deploy:fly" -ForegroundColor Cyan
} else {
  ($r.Output | Out-String).Trim() | Write-Host
  exit $r.ExitCode
}
