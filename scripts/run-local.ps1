# Local dev: SQLite + shopify app dev (CLI injects tunnel into SHOPIFY_APP_URL)
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\run-local.ps1
# Do NOT put https://example.com in .env — causes Example Domain.

param(
  [switch]$FullUpdate
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$envPath = Join-Path $root ".env"
if (Test-Path $envPath) {
  $envText = Get-Content $envPath -Raw
  if ($envText -match '(?m)^SHOPIFY_APP_URL=.*example\.com') {
    Write-Error "SHOPIFY_APP_URL is example.com in .env. Clear it (SHOPIFY_APP_URL=) then re-run. CLI will set the tunnel URL."
  }
}

Write-Host ""
Write-Host "==> Switch Prisma to SQLite" -ForegroundColor Cyan
npm run db:sqlite
npx prisma generate
npx prisma migrate deploy

Write-Host ""
Write-Host "==> Start Shopify dev server" -ForegroundColor Cyan
Write-Host "Config: shopify.app.dev.toml (tunnel URL rewrite)" -ForegroundColor Yellow
Write-Host "Store:  bundleguard-nkhkwmsy.myshopify.com" -ForegroundColor Yellow
Write-Host "Open the Preview URL from CLI output — not example.com" -ForegroundColor Yellow
Write-Host ""

$config = if ($FullUpdate) { "shopify.app.toml" } else { "shopify.app.dev.toml" }
if ($FullUpdate) {
  Write-Host "Using full shopify.app.toml (may require Protected customer data)`n" -ForegroundColor Yellow
}

npx shopify app dev --config $config --store bundleguard-nkhkwmsy.myshopify.com
