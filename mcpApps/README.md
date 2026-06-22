# Magic NetSuite MCP Apps

This folder contains the Magic NetSuite MCP Apps host for Claude Desktop.

It exposes:
- Magic NetSuite Context Picker
- Magic NetSuite Suitelet Viewer

## Install for Claude Desktop

Run:

`powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\installClaudeMcpApps.ps1
`

Then restart Claude Desktop.

The installer writes this server to %APPDATA%\Claude\claude_desktop_config.json:

`json
"magic-netsuite-apps": {
  "command": "<this-folder>\\runtime\\node.exe",
  "args": ["<this-folder>\\dist\\main.js", "--stdio"],
  "env": {
    "MAGIC_NETSUITE_MCP_PIPE": "magic_netsuite_mcp_bridge",
    "MAGIC_NS_PLAYWRIGHT": "1"
  }
}
`

The bundled Node runtime is used, so the user does not need Node installed.
Playwright mode is enabled by default. Pass -DisablePlaywright only if you
need to force the legacy external-browser fallback.

The Magic NetSuite Chrome extension MCP bridge must also be installed and enabled.
