param(
    [switch]$UsePlaywright
)

$ErrorActionPreference = "Stop"

$AppRoot = $PSScriptRoot
$NodeExe = Join-Path $AppRoot "runtime\node.exe"
$MainJs = Join-Path $AppRoot "dist\main.js"
$ServerName = "magic-netsuite-apps"
$ClaudeDir = Join-Path $env:APPDATA "Claude"
$ClaudeConfigPath = Join-Path $ClaudeDir "claude_desktop_config.json"

function ConvertTo-Hashtable {
    param([Parameter(ValueFromPipeline)] $InputObject)

    if ($null -eq $InputObject) { return $null }

    if ($InputObject -is [System.Collections.IDictionary]) {
        $hash = @{}
        foreach ($key in $InputObject.Keys) {
            $hash[$key] = ConvertTo-Hashtable $InputObject[$key]
        }
        return $hash
    }

    if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {
        $items = @()
        foreach ($item in $InputObject) {
            $items += ConvertTo-Hashtable $item
        }
        return $items
    }

    if ($InputObject -is [pscustomobject]) {
        $hash = @{}
        foreach ($property in $InputObject.PSObject.Properties) {
            $hash[$property.Name] = ConvertTo-Hashtable $property.Value
        }
        return $hash
    }

    return $InputObject
}

if (-not (Test-Path $NodeExe)) {
    throw "Bundled Node runtime not found at $NodeExe"
}

if (-not (Test-Path $MainJs)) {
    throw "MCP Apps entry point not found at $MainJs"
}

New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null

if (Test-Path $ClaudeConfigPath) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Copy-Item -LiteralPath $ClaudeConfigPath -Destination "$ClaudeConfigPath.bak-$timestamp" -Force
    $raw = Get-Content -LiteralPath $ClaudeConfigPath -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) {
        $config = @{}
    } else {
        $config = ConvertTo-Hashtable ($raw | ConvertFrom-Json)
    }
} else {
    $config = @{}
}

if (-not $config.ContainsKey("mcpServers") -or $null -eq $config["mcpServers"]) {
    $config["mcpServers"] = @{}
}

$config["mcpServers"][$ServerName] = [ordered]@{
    command = $NodeExe
    args = @($MainJs, "--stdio")
    env = [ordered]@{
        MAGIC_NETSUITE_MCP_PIPE = "magic_netsuite_mcp_bridge"
        MAGIC_NS_PLAYWRIGHT = $(if ($UsePlaywright) { "1" } else { "0" })
    }
}

$json = $config | ConvertTo-Json -Depth 30
Set-Content -LiteralPath $ClaudeConfigPath -Value $json -Encoding UTF8

Write-Host ""
Write-Host "Magic NetSuite MCP Apps installed for Claude Desktop."
Write-Host "Config: $ClaudeConfigPath"
Write-Host "Server key: $ServerName"
Write-Host ""
Write-Host "Restart Claude Desktop to load the apps."
Write-Host "Keep the Magic NetSuite extension installed and its MCP bridge enabled."
