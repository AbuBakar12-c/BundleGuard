# Local dev: SQLite + shopify app dev
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\run-local.ps1

param(
  [switch]$FullUpdate
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "`n==> Switch Prisma to SQLite" -ForegroundColor Cyan
npm run db:sqlite
npx prisma generate
npx prisma migrate deploy

Write-Host "`n==> Start Shopify dev server" -ForegroundColor Cyan
Write-Host "App:   shopify.app.toml (matches .env)" -ForegroundColor Yellow
Write-Host "Store: bundleguard-nkhkwmsy.myshopify.com`n" -ForegroundColor Yellow

$devArgs = @(
  "app", "dev",
  "--config", "shopify.app.dev.toml",
  "--store", "bundleguard-nkhkwmsy.myshopify.com"
)
if ($FullUpdate) {
  Write-Host "Using full shopify.app.toml (requires Protected customer data in Partners)`n" -ForegroundColor Yellow
  $devArgs = @(
    "app", "dev",
    "--config", "shopify.app.toml",
    "--store", "bundleguard-nkhkwmsy.myshopify.com"
  )
}

npx shopify @devArgs
