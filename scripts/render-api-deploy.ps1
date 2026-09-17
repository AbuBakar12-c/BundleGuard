# Deploy BundleGuard to Render via API (no dashboard clicks beyond creating an API key).
# Prerequisites:
#   1. Create API key: https://dashboard.render.com/u/settings#api-keys
#   2. Set env: $env:RENDER_API_KEY = "rnd_..."
#   3. Run: powershell -ExecutionPolicy Bypass -File .\scripts\render-api-deploy.ps1
#
# Creates Postgres + Docker web service from GitHub repo and sets env vars from
# production.render.vars.env / .env (secrets are not printed).

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$apiKey = $env:RENDER_API_KEY
if (-not $apiKey) {
  Write-Host "RENDER_API_KEY is not set." -ForegroundColor Red
  Write-Host "1) Open https://dashboard.render.com/u/settings#api-keys"
  Write-Host "2) Create an API Key"
  Write-Host '3) In PowerShell: $env:RENDER_API_KEY = "rnd_..."'
  Write-Host "4) Re-run this script"
  Start-Process "https://dashboard.render.com/u/settings#api-keys"
  exit 1
}

$headers = @{
  Authorization = "Bearer $apiKey"
  Accept        = "application/json"
  "Content-Type" = "application/json"
}

function Invoke-Render($Method, $Path, $Body = $null) {
  $uri = "https://api.render.com/v1$Path"
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
  }
  $json = $Body | ConvertTo-Json -Depth 20
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body $json
}

Write-Host "==> Owners / workspaces" -ForegroundColor Cyan
$owners = Invoke-Render GET "/owners?limit=20"
$ownerId = $null
if ($owners -is [System.Array]) {
  $ownerId = $owners[0].owner.id
  if (-not $ownerId) { $ownerId = $owners[0].id }
} else {
  $ownerId = $owners.owner.id
  if (-not $ownerId) { $ownerId = $owners.id }
}
# API often returns [{owner:{id:...}}]
if (-not $ownerId -and $owners.Count -gt 0) {
  $first = $owners[0]
  if ($first.owner) { $ownerId = $first.owner.id } else { $ownerId = $first.id }
}
if (-not $ownerId) {
  # Try alternate shape
  $raw = Invoke-WebRequest -Uri "https://api.render.com/v1/owners" -Headers @{ Authorization = "Bearer $apiKey"; Accept = "application/json" }
  Write-Host $raw.Content
  Write-Error "Could not resolve ownerId from /owners"
}
Write-Host ("Using ownerId: " + $ownerId)

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
$renderVars = Read-DotEnv (Join-Path $root "production.render.vars.env")
$inputs = Read-DotEnv (Join-Path $root "production.inputs.env")

function Pick($key) {
  if ($renderVars[$key]) { return $renderVars[$key] }
  if ($local[$key]) { return $local[$key] }
  if ($inputs[$key]) { return $inputs[$key] }
  return $null
}

$repo = "https://github.com/AbuBakar12-c/BundleGuard"
$name = "bundleguard"

Write-Host "==> Checking existing services" -ForegroundColor Cyan
$services = Invoke-Render GET "/services?limit=50&name=$name"
$existing = $null
foreach ($row in @($services)) {
  $svc = if ($row.service) { $row.service } else { $row }
  if ($svc.name -eq $name) { $existing = $svc; break }
}

Write-Host "==> Ensuring Postgres" -ForegroundColor Cyan
$dbs = Invoke-Render GET "/postgres?limit=50"
$db = $null
foreach ($row in @($dbs)) {
  $p = if ($row.postgres) { $row.postgres } else { $row }
  if ($p.name -eq "bundleguard-db") { $db = $p; break }
}

if (-not $db) {
  $dbBody = @{
    name         = "bundleguard-db"
    ownerId      = $ownerId
    plan         = "free"
    region       = "oregon"
    databaseName = "bundleguard"
    user         = "bundleguard"
    version      = "16"
  }
  $createdDb = Invoke-Render POST "/postgres" $dbBody
  $db = if ($createdDb.postgres) { $createdDb.postgres } else { $createdDb }
  Write-Host ("Created Postgres: " + $db.id)
} else {
  Write-Host ("Postgres exists: " + $db.id)
}

# Connection string for env
$conn = $null
try {
  $connInfo = Invoke-Render GET ("/postgres/" + $db.id + "/connection-info")
  $conn = $connInfo.externalConnectionString
  if (-not $conn) { $conn = $connInfo.internalConnectionString }
} catch {
  Write-Host "Could not fetch connection-info yet; will link DATABASE_URL via dashboard if needed." -ForegroundColor Yellow
}

$shopifyAppUrl = Pick "SHOPIFY_APP_URL"
if (-not $shopifyAppUrl -or $shopifyAppUrl -match "bundleguard\.onrender\.com$") {
  # Canonical live service host (must match shopify.app.toml)
  $shopifyAppUrl = "https://bundleguard-24n6.onrender.com"
}

$envList = @(
  @{ key = "NODE_ENV"; value = "production" },
  @{ key = "SHOPIFY_BILLING_TEST"; value = "false" },
  @{ key = "SCOPES"; value = (Pick "SCOPES") },
  @{ key = "SHOPIFY_API_KEY"; value = (Pick "SHOPIFY_API_KEY") },
  @{ key = "SHOPIFY_API_SECRET"; value = (Pick "SHOPIFY_API_SECRET") },
  @{ key = "OPENAI_API_KEY"; value = (Pick "OPENAI_API_KEY") },
  @{ key = "SHOPIFY_APP_URL"; value = $shopifyAppUrl },
  @{ key = "SUPPORT_EMAIL"; value = (Pick "SUPPORT_EMAIL") },
  @{ key = "PRIVACY_EMAIL"; value = (Pick "PRIVACY_EMAIL") },
  @{ key = "COMPANY_NAME"; value = (Pick "COMPANY_NAME") }
) | Where-Object { $_.value }

if ($conn) {
  $envList += @{ key = "DATABASE_URL"; value = $conn }
}

if (-not $existing) {
  Write-Host "==> Creating web service (Docker)" -ForegroundColor Cyan
  $svcBody = @{
    type    = "web_service"
    name    = $name
    ownerId = $ownerId
    repo    = $repo
    branch  = "main"
    autoDeploy = "yes"
    envVars = $envList
    serviceDetails = @{
      runtime = "docker"
      plan    = "starter"
      region  = "oregon"
      healthCheckPath = "/readyz"
      envSpecificDetails = @{
        dockerfilePath = "./Dockerfile"
        dockerContext  = "."
      }
    }
  }
  $created = Invoke-Render POST "/services" $svcBody
  $svc = if ($created.service) { $created.service } else { $created }
  Write-Host ("Created service: " + $svc.id)
} else {
  $svc = $existing
  Write-Host ("Service exists: " + $svc.id + " - triggering deploy")
  try {
    Invoke-Render POST ("/services/" + $svc.id + "/deploys") @{ clearCache = "do_not_clear" } | Out-Null
  } catch {
    Write-Host "Redeploy request issue: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

# Resolve public URL
Start-Sleep -Seconds 3
$svcFresh = Invoke-Render GET ("/services/" + $svc.id)
$serviceObj = if ($svcFresh.service) { $svcFresh.service } else { $svcFresh }
$url = $serviceObj.serviceDetails.url
if (-not $url) { $url = $serviceObj.url }
if ($url) {
  $url = $url.TrimEnd("/")
  Write-Host ("Service URL: " + $url) -ForegroundColor Green

  # Update SHOPIFY_APP_URL env
  try {
    Invoke-Render PUT ("/services/" + $svc.id + "/env-vars") @(
      @{ key = "SHOPIFY_APP_URL"; value = $url }
    ) | Out-Null
  } catch {
    # Some API versions use PATCH differently
    Write-Host "Set SHOPIFY_APP_URL=$url manually if auto-update failed." -ForegroundColor Yellow
  }

  # Persist for local wiring
  $inputsPath = Join-Path $root "production.inputs.env"
  if (Test-Path $inputsPath) {
    $c = Get-Content $inputsPath -Raw
    if ($c -match '(?m)^PRODUCTION_APP_URL=') {
      $c = [regex]::Replace($c, '(?m)^PRODUCTION_APP_URL=.*$', "PRODUCTION_APP_URL=$url")
    } else {
      $c = $c.TrimEnd() + "`nPRODUCTION_APP_URL=$url`n"
    }
    [System.IO.File]::WriteAllText($inputsPath, $c)
  }

  & (Join-Path $PSScriptRoot "set-production-url.ps1") -Url $url
  Write-Host ""
  Write-Host "Deploy kicked off. Wait for green on Render, then:" -ForegroundColor Cyan
  Write-Host ("  npm run smoke:prod -- " + $url)
  Write-Host "  npx shopify app deploy --config shopify.app.toml"
} else {
  Write-Host "Service created but URL not ready yet. Check https://dashboard.render.com" -ForegroundColor Yellow
}
