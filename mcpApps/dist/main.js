import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import { createServer } from "./server.js";
import { getBearerToken, isOriginAllowed, resolveMcpHttpSecurityConfig, tokensMatch, } from "./http-security.js";
export async function startStreamableHTTPServer(createServerInstance) {
    const port = Number.parseInt(process.env.PORT ?? "3001", 10);
    const { host, token, allowedOrigins } = resolveMcpHttpSecurityConfig();
    const app = createMcpExpressApp({ host });
    app.use((req, res, next) => {
        const origin = req.header("origin");
        if (!isOriginAllowed(origin, allowedOrigins)) {
            res.status(403).json({
                error: "Browser origin is not allowed. Configure MAGIC_NS_MCP_ALLOWED_ORIGINS explicitly.",
            });
            return;
        }
        next();
    });
    app.use(cors({
        origin(origin, callback) {
            if (!isOriginAllowed(origin, allowedOrigins)) {
                callback(null, false);
                return;
            }
            callback(null, Boolean(origin));
        },
        allowedHeaders: ["authorization", "content-type", "mcp-protocol-version"],
        methods: ["POST", "GET", "DELETE", "OPTIONS"],
    }));
    app.all("/mcp", async (req, res) => {
        if (token &&
            !tokensMatch(getBearerToken(req.header("authorization")), token)) {
            res.status(401).json({ error: "Missing or invalid bearer token." });
            return;
        }
        const server = createServerInstance();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        res.on("close", () => {
            transport.close().catch(() => { });
            server.close().catch(() => { });
        });
        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        }
        catch (error) {
            console.error("MCP error:", error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: { code: -32603, message: "Internal server error" },
                    id: null,
                });
            }
        }
    });
    const httpServer = app.listen(port, host, (err) => {
        if (err) {
            console.error("Failed to start server:", err);
            process.exit(1);
        }
        console.log(`Magic NetSuite MCP App listening on http://${host}:${port}/mcp`);
        if (!token) {
            console.log("MCP bearer authentication is disabled for this loopback-only server. " +
                "Set MAGIC_NS_MCP_TOKEN to require it.");
        }
    });
    const shutdown = () => {
        httpServer.close(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
export async function startStdioServer(createServerInstance) {
    await createServerInstance().connect(new StdioServerTransport());
}
async function main() {
    if (process.argv.includes("--stdio")) {
        await startStdioServer(createServer);
    }
    else {
        await startStreamableHTTPServer(createServer);
    }
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
