# Helps complete Railway deploy checklist (interactive steps remain for login/billing).
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\railway-ready.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "`n==> Railway production readiness`n" -ForegroundColor Magenta

$ok = $true
function Check($cond, $msg) {
  if ($cond) { Write-Host "  OK  $msg" -ForegroundColor Green }
  else { Write-Host "  --  $msg" -ForegroundColor Yellow; $script:ok = $false }
}

Check (Test-Path "railway.toml") "railway.toml present"
Check (Test-Path "Dockerfile") "Dockerfile present"
Check (Test-Path "docs/railway-deploy.md") "railway-deploy.md present"
Check (Test-Path "docs/production-inputs.example.env") "production inputs template present"
Check (Test-Path "scripts/set-production-url.ps1") "set-production-url.ps1 present"
Check (Test-Path "scripts/smoke-prod.ts") "smoke-prod.ts present"

$dockerfile = Get-Content "Dockerfile" -Raw
Check ($dockerfile -match "switch-db-provider.mjs postgres") "Dockerfile switches Prisma to Postgres"

Check (Test-Path "scripts/railway-bootstrap.ps1") "railway-bootstrap.ps1 present"
Check (Test-Path "scripts/go-live.ps1") "go-live.ps1 present"
Check (Test-Path "nixpacks.toml") "nixpacks.toml present"

$inputs = Join-Path $root "production.inputs.env"
Check (Test-Path $inputs) "production.inputs.env filled (copy from docs/production-inputs.example.env)"

if (Test-Path $inputs) {
  $map = @{}
  Get-Content $inputs | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') { $map[$matches[1].Trim()] = $matches[2].Trim() }
  }
  Check ([bool]$map["SUPPORT_EMAIL"]) "SUPPORT_EMAIL set"
  Check ([bool]$map["COMPANY_NAME"]) "COMPANY_NAME set"
  Check ($map["PARTNER_OWNED_APP"] -eq "true") "PARTNER_OWNED_APP=true"
  $url = $map["PRODUCTION_APP_URL"]
  Check ($url -match '^https://' -and $url -notmatch 'REPLACE|example') "PRODUCTION_APP_URL is real HTTPS"
}

$railway = Get-Command railway -ErrorAction SilentlyContinue
if ($railway) {
  Write-Host "`n  railway CLI found: $($railway.Source)" -ForegroundColor Cyan
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $whoOut = & railway whoami 2>&1 | Out-String
  $whoCode = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($whoCode -eq 0 -and $whoOut -notmatch "Unauthorized") {
    Write-Host "  Logged in: $($whoOut.Trim())" -ForegroundColor Green
    Write-Host "  Next: npm run railway:bootstrap" -ForegroundColor Cyan
  } else {
    Write-Host "  Not logged in. In YOUR interactive terminal run: railway login" -ForegroundColor Yellow
    Write-Host "  Then: npm run railway:bootstrap" -ForegroundColor Yellow
  }
} else {
  Write-Host "`n  railway CLI not installed. Install: npm i -g @railway/cli" -ForegroundColor Yellow
  Write-Host "  Or deploy via https://railway.app dashboard (GitHub connect)." -ForegroundColor Yellow
}

Write-Host ""
if ($ok -and (Test-Path $inputs)) {
  Write-Host "Local checklist complete. Deploy on Railway, then re-run apply-production-inputs.ps1." -ForegroundColor Green
} else {
  Write-Host "Complete the items marked -- then deploy. See docs/railway-deploy.md" -ForegroundColor Yellow
}
