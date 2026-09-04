# BundleGuard go-live orchestrator (Render)
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\go-live.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host " BundleGuard go-live (Render)" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

Write-Host "==> 1/4 Repo readiness" -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "render-ready.ps1")

Write-Host ""
Write-Host "==> 2/4 Deploy check + critical tests" -ForegroundColor Cyan
npm run deploy:check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run test:critical
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$inputsPath = Join-Path $root "production.inputs.env"
$url = $null
if (Test-Path $inputsPath) {
  Get-Content $inputsPath | ForEach-Object {
    if ($_ -match '^\s*PRODUCTION_APP_URL=(.*)$') {
      $url = $matches[1].Trim()
    }
  }
}

Write-Host ""
Write-Host "==> 3/4 Wire Shopify URLs (if PRODUCTION_APP_URL set)" -ForegroundColor Cyan
if ($url -and $url -match '^https://' -and $url -notmatch 'REPLACE|example|localhost') {
  & (Join-Path $PSScriptRoot "set-production-url.ps1") -Url $url
  Write-Host ""
  Write-Host "Run interactively (required):" -ForegroundColor Yellow
  Write-Host "  npx shopify app deploy --config shopify.app.toml"
} else {
  Write-Host "Skipped - set PRODUCTION_APP_URL in production.inputs.env after Render URL exists." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==> 4/4 Production smoke (if URL set)" -ForegroundColor Cyan
if ($url -and $url -match '^https://' -and $url -notmatch 'REPLACE|example|localhost') {
  npx tsx scripts/smoke-prod.ts $url
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "Skipped - deploy on Render first, then:" -ForegroundColor Yellow
  Write-Host "  npm run smoke:prod -- https://YOUR_SERVICE.onrender.com"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " Repo automation complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host @"

YOUR remaining steps:
  1. Confirm Render Blueprint deploy is live
  2. Put HTTPS URL in production.inputs.env as PRODUCTION_APP_URL
  3. Re-run: npm run go:live
  4. npx shopify app deploy --config shopify.app.toml
  5. Reinstall app on dev store and smoke-test features

"@
