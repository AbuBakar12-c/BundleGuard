# Build a local Render env checklist from .env + production.inputs.env (gitignored).
# Does not print secret values to the console.
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\render-env-from-local.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Read-DotEnv($path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
      $map[$matches[1].Trim()] = $matches[2].Trim()
    }
  }
  return $map
}

$local = Read-DotEnv (Join-Path $root ".env")
$inputs = Read-DotEnv (Join-Path $root "production.inputs.env")

$support = if ($inputs["SUPPORT_EMAIL"]) { $inputs["SUPPORT_EMAIL"] } else { "mabubakr.pro@gmail.com" }
$privacy = if ($inputs["PRIVACY_EMAIL"]) { $inputs["PRIVACY_EMAIL"] } else { $support }
$company = if ($inputs["COMPANY_NAME"]) { $inputs["COMPANY_NAME"] } else { "BundleGuard" }
$appUrl = if ($inputs["PRODUCTION_APP_URL"]) { $inputs["PRODUCTION_APP_URL"] } else { "https://bundleguard.onrender.com" }

$lines = @(
  "NODE_ENV=production"
  "SHOPIFY_BILLING_TEST=false"
  ("SCOPES=" + $(if ($local["SCOPES"]) { $local["SCOPES"] } else { "read_products,write_products,read_inventory,read_locations,read_orders,write_app_proxy" }))
  ("SHOPIFY_API_KEY=" + $local["SHOPIFY_API_KEY"])
  ("SHOPIFY_API_SECRET=" + $local["SHOPIFY_API_SECRET"])
  ("OPENAI_API_KEY=" + $local["OPENAI_API_KEY"])
  ("SHOPIFY_APP_URL=" + $appUrl)
  ("SUPPORT_EMAIL=" + $support)
  ("PRIVACY_EMAIL=" + $privacy)
  ("COMPANY_NAME=" + $company)
)

$out = Join-Path $root "production.render.vars.env"
[System.IO.File]::WriteAllText($out, ($lines -join "`n"))
Write-Host ("Wrote " + $out + " (gitignored). Open it locally and paste into Render Environment.") -ForegroundColor Green
Write-Host "Update SHOPIFY_APP_URL to the exact https://....onrender.com URL after Render creates the service." -ForegroundColor Yellow
