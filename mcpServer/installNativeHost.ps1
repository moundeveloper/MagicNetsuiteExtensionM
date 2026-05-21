param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId,

  [ValidateSet("Chrome", "Edge")]
  [string]$Browser = "Chrome",

  [string]$HostDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($HostDir)) {
  $HostDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$hostName = "com.magicnetsuite.mcp_bridge"
$hostExe = Join-Path $HostDir "magicNetsuiteNativeHost.exe"

if (-not (Test-Path $hostExe)) {
  throw "Native host executable not found: $hostExe"
}

$resolvedHostExe = (Resolve-Path $hostExe).Path
$manifestPath = Join-Path $HostDir "$hostName.json"
$origin = "chrome-extension://$ExtensionId/"

$manifest = [ordered]@{
  name = $hostName
  description = "Magic Netsuite MCP native messaging bridge"
  path = $resolvedHostExe
  type = "stdio"
  allowed_origins = @($origin)
}

$manifestJson = $manifest | ConvertTo-Json -Depth 5
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, $utf8NoBom)

$registryPath = switch ($Browser) {
  "Chrome" { "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName" }
  "Edge" { "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName" }
}

New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value (Resolve-Path $manifestPath).Path

Write-Host "Installed $hostName for $Browser"
Write-Host "Manifest: $manifestPath"
Write-Host "Allowed origin: $origin"
