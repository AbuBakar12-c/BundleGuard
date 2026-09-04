# Open Render Blueprint UI and print env values to set (without echoing secrets to console by default).
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\render-open-blueprint.ps1 [-RepoUrl https://github.com/USER/REPO]

param(
  [string]$RepoUrl = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not $RepoUrl) {
  $ErrorActionPreference = "Continue"
  $origin = & git remote get-url origin 2>$null
  $ErrorActionPreference = "Stop"
  if ($origin) {
    $RepoUrl = $origin.Trim() -replace '\.git$','' -replace '^git@github.com:','https://github.com/'
  }
}

if (-not $RepoUrl) {
  Write-Error "No repo URL. Pass -RepoUrl https://github.com/OWNER/REPO"
}

Write-Host ""
Write-Host "Opening Render Blueprints dashboard..." -ForegroundColor Cyan
Write-Host "Select repo: $RepoUrl" -ForegroundColor Yellow
Write-Host ""

Start-Process "https://dashboard.render.com/blueprints/new"

$envPath = Join-Path $root ".env"
if (Test-Path $envPath) {
  Write-Host "After Blueprint create, set these on the web service (values from local .env - not printed here):" -ForegroundColor Green
  Write-Host "  SHOPIFY_API_KEY"
  Write-Host "  SHOPIFY_API_SECRET"
  Write-Host "  OPENAI_API_KEY"
  Write-Host "  SHOPIFY_APP_URL   (https://YOUR_SERVICE.onrender.com after deploy)"
  Write-Host "  SUPPORT_EMAIL / PRIVACY_EMAIL / COMPANY_NAME  (from production.inputs.env)"
}

Write-Host ""
Write-Host "When deploy is live, paste the HTTPS URL back into chat or:" -ForegroundColor Cyan
Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\set-production-url.ps1 -Url https://....onrender.com"
