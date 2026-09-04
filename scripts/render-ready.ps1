# Render deploy readiness checklist for BundleGuard
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\render-ready.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host ""
Write-Host "==> Render production readiness" -ForegroundColor Magenta
Write-Host ""

$ok = $true
function Check($cond, $msg) {
  if ($cond) { Write-Host ("  OK  " + $msg) -ForegroundColor Green }
  else { Write-Host ("  --  " + $msg) -ForegroundColor Yellow; $script:ok = $false }
}

Check (Test-Path "render.yaml") "render.yaml present"
Check (Test-Path "Dockerfile") "Dockerfile present"
Check (Test-Path "docs/render-deploy.md") "render-deploy.md present"
Check (Test-Path "package-lock.json") "package-lock.json present (needed for npm ci)"
Check (Test-Path "scripts/set-production-url.ps1") "set-production-url.ps1 present"
Check (Test-Path "scripts/smoke-prod.ts") "smoke-prod.ts present"

$dockerfile = Get-Content "Dockerfile" -Raw
Check ($dockerfile -match "switch-db-provider.mjs postgres") "Dockerfile switches Prisma to Postgres"

$yaml = Get-Content "render.yaml" -Raw
Check ($yaml -match "healthCheckPath:\s*/readyz") "health check /readyz"
Check ($yaml -match "fromDatabase") "DATABASE_URL from Postgres"

$inputs = Join-Path $root "production.inputs.env"
Check (Test-Path $inputs) "production.inputs.env present"
if (Test-Path $inputs) {
  $map = @{}
  Get-Content $inputs | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') { $map[$matches[1].Trim()] = $matches[2].Trim() }
  }
  Check ([bool]$map["SUPPORT_EMAIL"]) "SUPPORT_EMAIL set"
  Check ([bool]$map["COMPANY_NAME"]) "COMPANY_NAME set"
  $url = $map["PRODUCTION_APP_URL"]
  Check ($url -match '^https://' -and $url -notmatch 'REPLACE|example') "PRODUCTION_APP_URL is real HTTPS"
}

Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  1. Push repo to GitHub (if not already)"
Write-Host "  2. Open https://dashboard.render.com/blueprints and create from this repo"
Write-Host "  3. Fill sync:false env vars (Shopify + OpenAI + support email)"
Write-Host "  4. After URL exists: npm run prod:url -- -Url https://YOUR.onrender.com"
Write-Host "  5. npx shopify app deploy --config shopify.app.toml"
Write-Host "  6. npm run smoke:prod -- https://YOUR.onrender.com"
Write-Host ""

if ($ok) {
  Write-Host "Local Render checklist complete (URL may still be pending)." -ForegroundColor Green
} else {
  Write-Host "Complete items marked -- then deploy." -ForegroundColor Yellow
}
