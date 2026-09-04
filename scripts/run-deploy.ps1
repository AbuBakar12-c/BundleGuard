# Full production deploy: Fly.io + Shopify app deploy
# Prereqs: fly auth login + billing card on https://fly.io/dashboard
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\run-deploy.ps1

param(
  [string]$FlyUrl = "https://bundleguard.fly.dev",
  [switch]$SkipShopify
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
. (Join-Path $PSScriptRoot "fly-utils.ps1")

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host " BundleGuard production deploy" -ForegroundColor Magenta
Write-Host "========================================`n" -ForegroundColor Magenta

Write-Host "==> Fly auth check" -ForegroundColor Cyan
$whoami = Get-FlyctlWhoami
if (-not $whoami) {
  Write-Host "Not logged in. Run:" -ForegroundColor Yellow
  Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\fly-login.ps1`n" -ForegroundColor White
  exit 1
}
Write-Host "Logged in as $whoami" -ForegroundColor Green

Write-Host "`n==> Fly deploy (app + Postgres + secrets)" -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "fly-deploy.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipShopify) {
  Write-Host "`n==> Update Shopify URLs + deploy app version" -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot "update-shopify-url.ps1") -Url $FlyUrl
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host " DONE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "App URL:  $FlyUrl"
Write-Host "Health:   $FlyUrl/healthz"
Write-Host "Privacy:  $FlyUrl/privacy"
Write-Host "`nOpen your dev store admin and reinstall/open BundleGuard.`n" -ForegroundColor Yellow
