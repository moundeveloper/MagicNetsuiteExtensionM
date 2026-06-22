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
  "args": ["<this-folder>\\dist\\main.js", "--stdio"]
}
`

The bundled Node runtime is used, so the user does not need Node installed.

The Magic NetSuite Chrome extension MCP bridge must also be installed and enabled.
