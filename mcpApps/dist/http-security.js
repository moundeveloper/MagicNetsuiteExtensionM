import { timingSafeEqual } from "node:crypto";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
export const isLoopbackHost = (host) => {
    const normalized = host.trim().toLowerCase();
    return LOOPBACK_HOSTS.has(normalized.startsWith("[") && normalized.endsWith("]")
        ? normalized.slice(1, -1)
        : normalized);
};
export const parseAllowedOrigins = (value) => {
    const origins = String(value ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    if (origins.some((origin) => origin.toLowerCase() === "null")) {
        throw new Error('MAGIC_NS_MCP_ALLOWED_ORIGINS cannot allow the opaque "null" origin.');
    }
    return new Set(origins);
};
export const tokensMatch = (provided, expected) => {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    return (providedBuffer.length === expectedBuffer.length &&
        timingSafeEqual(providedBuffer, expectedBuffer));
};
export const getBearerToken = (authorization) => {
    const match = String(authorization ?? "").match(/^Bearer\s+(\S+)\s*$/i);
    return match?.[1] ?? "";
};
export const isOriginAllowed = (origin, allowedOrigins) => !origin || allowedOrigins.has(origin);
export const resolveMcpHttpSecurityConfig = (env = process.env) => {
    const host = (env.MAGIC_NS_MCP_HOST ?? "127.0.0.1").trim();
    const token = (env.MAGIC_NS_MCP_TOKEN ?? "").trim();
    const allowedOrigins = parseAllowedOrigins(env.MAGIC_NS_MCP_ALLOWED_ORIGINS);
    const isLoopback = isLoopbackHost(host);
    if (!host) {
        throw new Error("MAGIC_NS_MCP_HOST cannot be empty.");
    }
    if (!isLoopback && !token) {
        throw new Error("Refusing to expose the MCP HTTP server beyond loopback without " +
            "MAGIC_NS_MCP_TOKEN. Set a strong token or use MAGIC_NS_MCP_HOST=127.0.0.1.");
    }
    return { host, token, allowedOrigins, isLoopback };
};
