param(
    [switch]$UsePlaywright,
    [switch]$DisablePlaywright
)

$ErrorActionPreference = "Stop"

$AppRoot = $PSScriptRoot
$NodeExe = Join-Path $AppRoot "runtime\node.exe"
$MainJs = Join-Path $AppRoot "dist\main.js"
$ServerName = "magic-netsuite-apps"
$LegacyServerName = "magic-netsuite-app"
$ClaudeDir = Join-Path $env:APPDATA "Claude"
$ClaudeConfigPath = Join-Path $ClaudeDir "claude_desktop_config.json"

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
} else {
    "{}" | Set-Content -LiteralPath $ClaudeConfigPath -Encoding UTF8
}

$playwrightValue = if ($DisablePlaywright) { "0" } else { "1" }

$updateScript = @'
const fs = require("fs");

const [
  configPath,
  serverName,
  legacyServerName,
  nodeExe,
  mainJs,
  playwrightValue,
] = process.argv.slice(2);

let config = {};
const raw = fs.existsSync(configPath)
  ? fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "")
  : "";

if (raw.trim()) {
  config = JSON.parse(raw);
}

if (!config || typeof config !== "object" || Array.isArray(config)) {
  config = {};
}

if (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
  config.mcpServers = {};
}

delete config.mcpServers[legacyServerName];

config.mcpServers[serverName] = {
  command: nodeExe,
  args: [mainJs, "--stdio"],
  env: {
    MAGIC_NETSUITE_MCP_PIPE: "magic_netsuite_mcp_bridge",
    MAGIC_NS_PLAYWRIGHT: playwrightValue,
  },
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
'@

$updateScriptPath = Join-Path ([System.IO.Path]::GetTempPath()) "magic-netsuite-install-claude-mcp-apps.js"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($updateScriptPath, $updateScript, $utf8NoBom)
try {
    & $NodeExe $updateScriptPath $ClaudeConfigPath $ServerName $LegacyServerName $NodeExe $MainJs $playwrightValue
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to update Claude Desktop MCP Apps config."
    }
} finally {
    Remove-Item -LiteralPath $updateScriptPath -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Magic NetSuite MCP Apps installed for Claude Desktop."
Write-Host "Config: $ClaudeConfigPath"
Write-Host "Server key: $ServerName"
Write-Host "Playwright: $playwrightValue"
Write-Host ""
Write-Host "Restart Claude Desktop to load the apps."
Write-Host "Keep the Magic NetSuite extension installed and its MCP bridge enabled."
