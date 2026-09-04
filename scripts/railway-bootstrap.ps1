# Automates Railway project bootstrap after `railway login`.
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\railway-bootstrap.ps1
#
# Creates/links project, adds Postgres, deploys Dockerfile service, generates domain.
# You still paste Shopify/OpenAI secrets in the Railway dashboard (or via `railway variables set`).

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "`n==> Railway bootstrap`n" -ForegroundColor Magenta

railway whoami 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in. Starting browserless login…" -ForegroundColor Yellow
  Write-Host "Complete the pairing in your browser, then re-run this script." -ForegroundColor Yellow
  railway login --browserless
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$status = railway status 2>&1 | Out-String
if ($status -match "No linked project" -or $LASTEXITCODE -ne 0) {
  Write-Host "Creating / linking Railway project…" -ForegroundColor Cyan
  railway init
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Ensuring Postgres plugin…" -ForegroundColor Cyan
# Idempotent-ish: if add fails because it exists, continue
railway add --database postgres 2>&1 | Out-Host

Write-Host "Deploying from Dockerfile (railway up)…" -ForegroundColor Cyan
railway up --detach
if ($LASTEXITCODE -ne 0) {
  Write-Error "railway up failed. Set Variables in dashboard first if boot requires secrets."
}

Write-Host "Generating public domain…" -ForegroundColor Cyan
railway domain 2>&1 | Out-Host

Write-Host "`nNext:" -ForegroundColor Green
Write-Host "  1. railway variables set NODE_ENV=production SHOPIFY_BILLING_TEST=false …"
Write-Host "  2. Copy the https://….up.railway.app URL into production.inputs.env as PRODUCTION_APP_URL"
Write-Host "  3. Set SHOPIFY_APP_URL to that same URL on Railway"
Write-Host "  4. npm run prod:inputs && npm run go:live"
Write-Host "  5. npx shopify app deploy --config shopify.app.toml"
Write-Host "  6. npm run smoke:prod -- <url>"
