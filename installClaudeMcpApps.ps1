param(
    [switch]$UsePlaywright
)

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Installer = Join-Path $ScriptRoot "mcpApps\installClaudeMcpApps.ps1"

if (-not (Test-Path $Installer)) {
    throw "Could not find MCP Apps installer at $Installer"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $Installer @PSBoundParameters
exit $LASTEXITCODE
