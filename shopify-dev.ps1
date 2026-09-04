# Run Shopify CLI with Node 22+ (Cursor helper or PATH).
# Your default terminal Node is v20.11.1, which cannot run @shopify/cli@4.6.1.

$ErrorActionPreference = "Stop"

$cursorNode = Join-Path $env:LOCALAPPDATA "Programs\cursor\resources\app\resources\helpers\node.exe"
$cli = Join-Path $env:APPDATA "npm\node_modules\@shopify\cli\bin\run.js"
$store = "bundleguard-nkhkwmsy.myshopify.com"

if (Test-Path $cursorNode) {
  $node = $cursorNode
} else {
  $node = (Get-Command node).Source
}

$nodeVersion = & $node -v
Write-Host "Using Node $nodeVersion from $node"

if (-not (Test-Path $cli)) {
  throw "Shopify CLI not found at $cli. Run: npm i -g @shopify/cli@latest"
}

Set-Location $PSScriptRoot
& $node $cli app dev --store $store @args
exit $LASTEXITCODE
