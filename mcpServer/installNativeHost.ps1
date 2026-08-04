param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId,

  [ValidateSet("Chrome", "Edge")]
  [string]$Browser = "Chrome",

  [string]$HostDir = $PSScriptRoot,

  [string]$ManifestDir = (Join-Path $env:LOCALAPPDATA "MagicNetsuite\NativeMessagingHosts"),

  [switch]$SkipRegistry
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($HostDir)) {
  $HostDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

if ($ExtensionId -notmatch '^[a-p]{32}$') {
  throw "Invalid Chrome extension ID: $ExtensionId"
}

if ([string]::IsNullOrWhiteSpace($ManifestDir)) {
  throw "A persistent native messaging manifest directory is required."
}

$hostName = "com.magicnetsuite.mcp_bridge"
$hostExe = Join-Path $HostDir "magicNetsuiteNativeHost.exe"

if (-not (Test-Path $hostExe)) {
  throw "Native host executable not found: $hostExe"
}

$resolvedHostExe = (Resolve-Path $hostExe).Path
$resolvedManifestDir = [System.IO.Path]::GetFullPath($ManifestDir)
New-Item -ItemType Directory -Path $resolvedManifestDir -Force | Out-Null
$manifestPath = Join-Path $resolvedManifestDir "$hostName.json"
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

if (-not $SkipRegistry) {
  $registryPath = switch ($Browser) {
    "Chrome" { "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName" }
    "Edge" { "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName" }
  }

  New-Item -Path $registryPath -Force | Out-Null
  Set-Item -Path $registryPath -Value (Resolve-Path $manifestPath).Path
}

Write-Host "Installed $hostName for $Browser"
Write-Host "Manifest: $manifestPath"
Write-Host "Allowed origin: $origin"
Write-Host "The manifest is stored outside the extension checkout and survives Git updates."
