# Point shopify.app.toml + .env SHOPIFY_APP_URL at the production HTTPS host.
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\set-production-url.ps1 -Url https://your-app.up.railway.app

param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$Url = $Url.Trim().TrimEnd("/")
if ($Url -notmatch '^https://') {
  Write-Error "Url must start with https://"
}
if ($Url -match 'example\.com|localhost|127\.0\.0\.1|trycloudflare|REPLACE_WITH') {
  Write-Error "Refusing placeholder/tunnel URL: $Url"
}

$tomlPath = Join-Path $root "shopify.app.toml"
$content = Get-Content $tomlPath -Raw
$content = $content -replace 'application_url = "https://[^"]+"', "application_url = `"$Url`""
# Replace any host in redirect URLs with the production host
$content = [regex]::Replace(
  $content,
  'https://[^/"\s]+/auth/callback',
  "$Url/auth/callback"
)
$content = [regex]::Replace(
  $content,
  'https://[^/"\s]+/auth/shopify/callback',
  "$Url/auth/shopify/callback"
)
$content = [regex]::Replace(
  $content,
  'https://[^/"\s]+/api/auth/callback',
  "$Url/api/auth/callback"
)
Set-Content -Path $tomlPath -Value $content -NoNewline
Write-Host "Updated shopify.app.toml → $Url" -ForegroundColor Green

$envPath = Join-Path $root ".env"
if (Test-Path $envPath) {
  $envContent = Get-Content $envPath -Raw
  if ($envContent -match '(?m)^SHOPIFY_APP_URL=') {
    $envContent = [regex]::Replace($envContent, '(?m)^SHOPIFY_APP_URL=.*$', "SHOPIFY_APP_URL=$Url")
  } else {
    $envContent = $envContent.TrimEnd() + "`nSHOPIFY_APP_URL=$Url`n"
  }
  Set-Content -Path $envPath -Value $envContent -NoNewline
  Write-Host "Updated local .env SHOPIFY_APP_URL (do not commit)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Next (interactive - you must run):" -ForegroundColor Cyan
Write-Host "  1. Set SHOPIFY_APP_URL=$Url on Render Environment"
Write-Host "  2. npx shopify app deploy --config shopify.app.toml"
Write-Host "  3. Reinstall/open the app on your dev store"
Write-Host "  4. npm run smoke:prod -- $Url"
