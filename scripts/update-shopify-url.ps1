# Point shopify.app.toml at Fly host, then deploy app version to Shopify.
param(
  [string]$Url = "https://bundleguard.fly.dev"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$toml = Join-Path $root "shopify.app.toml"
$content = Get-Content $toml -Raw

$content = $content -replace 'application_url = "https://[^"]+"', "application_url = `"$Url`""
$content = $content -replace 'https://[^/"]+/auth/callback', "$Url/auth/callback"
$content = $content -replace 'https://[^/"]+/auth/shopify/callback', "$Url/auth/shopify/callback"
$content = $content -replace 'https://[^/"]+/api/auth/callback', "$Url/api/auth/callback"

Set-Content -Path $toml -Value $content -NoNewline
Write-Host "Updated $toml -> $Url" -ForegroundColor Green
Write-Host "`nDeploying to Shopify (confirm prompts in CLI)..." -ForegroundColor Cyan
Set-Location $root
npx shopify app deploy
