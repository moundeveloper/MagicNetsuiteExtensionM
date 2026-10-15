import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
const require = createRequire(import.meta.url);
// Compiled hosts are self-contained: packageMcpApps.ps1 copies the entire dist.
// Only source execution may read the canonical files from the repository.
const sourceExecution = import.meta.url.endsWith(".ts");
const directory = new URL(sourceExecution ? "../mcp_server/" : "./dashboard-resources/", import.meta.url);
const helperFile = sourceExecution ? "dashboardFiles.js" : "dashboardFiles.cjs";
for (const name of ["dashboardTools.json", helperFile]) {
    if (!existsSync(new URL(name, directory))) {
        throw new Error(`Missing MCP dashboard resource ${name}. Run pnpm run build:server in mcp_app before packaging.`);
    }
}
const definitions = require(fileURLToPath(new URL("dashboardTools.json", directory)));
const { callDashboardWithFiles } = require(fileURLToPath(new URL(helperFile, directory)));
/** Both transports share the published schemas and local file adapter. */
export function registerDashboardTools(server, call) {
    for (const definition of definitions) {
        const shape = {};
        for (const [key, schema] of Object.entries(definition.inputSchema.properties)) {
            const field = z.fromJSONSchema(schema);
            shape[key] = definition.inputSchema.required.includes(key)
                ? field
                : field.optional();
        }
        server.registerTool(definition.name, { description: definition.description, inputSchema: shape }, async (args) => callDashboardWithFiles(definition.name, args, call));
    }
}
