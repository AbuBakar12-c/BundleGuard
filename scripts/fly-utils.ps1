# Shared helpers for flyctl on Windows PowerShell (stderr warnings must not stop scripts).

function Get-FlyctlPath {
  $env:Path += ";$env:USERPROFILE\.fly\bin"
  $fly = "$env:USERPROFILE\.fly\bin\flyctl.exe"
  if (Test-Path $fly) { return $fly }
  $cmd = Get-Command flyctl -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "flyctl not found. Install: winget install Fly-io.flyctl"
}

function Invoke-Flyctl {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$FlyArgs
  )

  $fly = Get-FlyctlPath
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & $fly @FlyArgs 2>&1
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev

  return [PSCustomObject]@{
    Output   = $output
    ExitCode = $code
  }
}

function Assert-FlyctlOk {
  param(
    [Parameter(Mandatory = $true)]
    $Result,
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  if ($Result.ExitCode -ne 0) {
    $text = ($Result.Output | Out-String).Trim()
    throw "$Message`n$text"
  }
}

function Get-FlyctlWhoami {
  $r = Invoke-Flyctl auth whoami
  if ($r.ExitCode -ne 0) { return $null }
  $line = $r.Output | Where-Object { $_ -is [string] -and $_ -match '@' } | Select-Object -First 1
  if ($line) { return $line.Trim() }
  return ($r.Output | Out-String).Trim()
}
