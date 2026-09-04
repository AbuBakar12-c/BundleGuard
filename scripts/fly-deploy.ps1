# BundleGuard — Fly.io deploy (run AFTER: fly auth login)
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\fly-deploy.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
. (Join-Path $PSScriptRoot "fly-utils.ps1")

$app = "bundleguard"
$dbName = "bundleguard-db"
$flyUrl = "https://$app.fly.dev"

Write-Host "`n==> 1/9 Fly auth check" -ForegroundColor Cyan
$whoami = Get-FlyctlWhoami
if (-not $whoami) { throw "Run first: powershell -ExecutionPolicy Bypass -File .\scripts\fly-login.ps1" }
Write-Host "Logged in as $whoami" -ForegroundColor Green

Write-Host "`n==> 2/9 fly launch --copy-config --no-deploy" -ForegroundColor Cyan
$r = Invoke-Flyctl launch --copy-config --no-deploy --yes
Assert-FlyctlOk $r "fly launch failed"

Write-Host "`n==> 3/9 fly postgres create" -ForegroundColor Cyan
$dbList = (Invoke-Flyctl postgres list).Output | Out-String
if ($dbList -notmatch [regex]::Escape($dbName)) {
  $r = Invoke-Flyctl postgres create --name $dbName --region iad --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1
  Assert-FlyctlOk $r "fly postgres create failed"
} else {
  Write-Host "Cluster $dbName already exists - skip create."
}

Write-Host "`n==> 4/9 fly postgres attach" -ForegroundColor Cyan
$r = Invoke-Flyctl postgres attach $dbName -a $app --yes
Assert-FlyctlOk $r "fly postgres attach failed"

Write-Host "`n==> 5/9 Load .env for secrets" -ForegroundColor Cyan
Get-Content (Join-Path $root ".env") | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

Write-Host "`n==> 6/9 fly secrets set" -ForegroundColor Cyan
$r = Invoke-Flyctl secrets set `
  "SHOPIFY_API_KEY=$env:SHOPIFY_API_KEY" `
  "SHOPIFY_API_SECRET=$env:SHOPIFY_API_SECRET" `
  "SCOPES=$env:SCOPES" `
  "SHOPIFY_APP_URL=$flyUrl" `
  "SHOPIFY_BILLING_TEST=false" `
  "OPENAI_API_KEY=$env:OPENAI_API_KEY" `
  -a $app
Assert-FlyctlOk $r "fly secrets set failed"

Write-Host "`n==> 7/9 npm run db:postgres" -ForegroundColor Cyan
npm run db:postgres
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx prisma generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n==> 8/9 fly deploy" -ForegroundColor Cyan
$r = Invoke-Flyctl deploy -a $app
Assert-FlyctlOk $r "fly deploy failed"

Write-Host "`n==> 9/9 Prisma db push on server" -ForegroundColor Cyan
$r = Invoke-Flyctl ssh console -a $app -C "cd /app; npx prisma db push"
Assert-FlyctlOk $r "prisma db push on server failed"

Write-Host "`n==> Health check" -ForegroundColor Cyan
curl.exe -s "$flyUrl/healthz"
Write-Host "`n`nDeploy complete. App URL: $flyUrl" -ForegroundColor Green
Write-Host "Next: set application_url in shopify.app.toml -> $flyUrl"
Write-Host "Then: npx shopify app deploy"
