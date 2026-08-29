$ErrorActionPreference = "Stop"

function Get-CommandVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$VersionCommand
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    return $null
  }

  return (& $VersionCommand | Out-String).Trim()
}

$env:LARKSUITE_CLI_NO_UPDATE_NOTIFIER = "1"
$env:LARKSUITE_CLI_NO_SKILLS_NOTIFIER = "1"

$larkVersion = Get-CommandVersion -Name "lark-cli" -VersionCommand { lark-cli --version }
$larkVerified = $false
$larkBotEventDryRunReady = $false
if ($larkVersion) {
  $larkStatus = (lark-cli auth status --json --verify 2>$null) | ConvertFrom-Json
  $larkVerified = [bool]$larkStatus.verified
  $larkDryRun = (lark-cli event consume im.message.receive_v1 --as bot --dry-run 2>$null) | ConvertFrom-Json
  $larkBotEventDryRunReady = [bool]$larkDryRun.ok -and [bool]$larkDryRun.dry_run
}

$dwsVersion = Get-CommandVersion -Name "dws" -VersionCommand { dws version }
$dwsAuthenticated = $false
$dwsTokenValid = $false
$dwsRefreshTokenValid = $false
$dwsPersonalEventDryRunReady = $false
if ($dwsVersion) {
  $dwsStatus = (dws auth status --format json 2>$null) | ConvertFrom-Json
  $dwsAuthenticated = [bool]$dwsStatus.authenticated
  $dwsTokenValid = [bool]$dwsStatus.token_valid
  $dwsRefreshTokenValid = [bool]$dwsStatus.refresh_token_valid
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  dws event +listen-im --kind all-direct --dry-run --format json 2>&1 | Out-Null
  $dwsPersonalEventDryRunReady = $LASTEXITCODE -eq 0
  $ErrorActionPreference = $previousErrorActionPreference
}

$openClawVersion = Get-CommandVersion -Name "openclaw" -VersionCommand { openclaw --version }

[pscustomobject]@{
  schemaVersion = 1
  feishu = [pscustomobject]@{
    installed = [bool]$larkVersion
    version = $larkVersion
    authenticated = $larkVerified
    botEventDryRunReady = $larkBotEventDryRunReady
  }
  dingtalk = [pscustomobject]@{
    installed = [bool]$dwsVersion
    version = ($dwsVersion -split "`r?`n" | Select-Object -First 1)
    authenticated = $dwsAuthenticated
    tokenValid = $dwsTokenValid
    refreshTokenValid = $dwsRefreshTokenValid
    personalDirectEventDryRunReady = $dwsPersonalEventDryRunReady
  }
  wechatClawBot = [pscustomobject]@{
    hostInstalled = [bool]$openClawVersion
    hostVersion = $openClawVersion
    bindingChecked = $false
  }
} | ConvertTo-Json -Depth 4
