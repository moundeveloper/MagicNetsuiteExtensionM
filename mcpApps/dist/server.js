import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool, } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { playwrightController } from "./playwright-controller.js";
// When on (default), the Suitelet control tools drive Playwright's own Chromium
// instead of the Chrome-extension CDP path. Set MAGIC_NS_PLAYWRIGHT=0 to fall
// back to the (still present, otherwise disabled) extension-backed controller.
const USE_PLAYWRIGHT = process.env.MAGIC_NS_PLAYWRIGHT !== "0";
const DIST_DIR = import.meta.filename.endsWith(".ts")
    ? path.join(import.meta.dirname, "dist")
    : import.meta.dirname;
const DEFAULT_PIPE_NAME = "magic_netsuite_mcp_bridge";
const BRIDGE_PIPE_NAME = process.env.MAGIC_NETSUITE_MCP_PIPE || DEFAULT_PIPE_NAME;
const BRIDGE_PIPE_PATH = process.env.MAGIC_NETSUITE_MCP_PIPE_PATH ||
    (process.platform === "win32"
        ? `\\\\.\\pipe\\${BRIDGE_PIPE_NAME}`
        : path.join(os.tmpdir(), `${BRIDGE_PIPE_NAME}.sock`));
const NETSUITE_TEMPLATE_RECREATION_WORKFLOW = `MANDATORY WORKFLOW for "recreate this template for NetSuite":

1. Load project knowledge first:
   - Call magic_netsuite_search_skills with query "netsuite freemarker advanced pdf bfo template".
   - Load the relevant skill before writing template code.

2. Do not jump straight to XML/SDF/upload/render.
   - Do NOT create an SDF advancedpdftemplate object as the first deliverable.
   - Do NOT deploy or upload to NetSuite unless the user explicitly asks.
   - Do NOT call conversion/render tools before explicit user approval.

3. Build a faithful local HTML design using BFO-compatible constraints:
   - Match the supplied reference image in HTML first; do not hand-write the final SDF object.
   - Use tables, inline widths, pt units, explicit <p align="..."> text wrappers, self-closing XML tags.
   - Avoid browser-only CSS: flex, grid, box-shadow, gradients, CSS variables, unsupported selectors.
   - Use representative values during HTML matching; bind record.* fields during the guarded FreeMarker stage.

4. Preview locally with Playwright (non-blocking):
   - Call magic_netsuite_template_preview_playwright with the local HTML/FTL-safe preview.
   - Inspect the screenshot returned by the tool.
   - Call magic_netsuite_template_review_wait only after the review is open.
   - Iterate with magic_netsuite_template_review_update until the screenshot matches the source design.

5. Run the guarded review flow:
   - HTML fixes return to the agent until the design is approved.
   - Approving HTML automatically creates the guarded session, converts to BFO-safe FreeMarker, and renders a PDF with NetSuite print tooling.
   - Rendering the PDF is never completion: remain in the same review wait until the user explicitly approves the final FreeMarker/PDF.
   - FreeMarker/PDF fixes return to the agent for direct FTL revision and NetSuite rerendering.
   - Final approval completes the review. Deployment remains a separate explicit action.

6. After final FreeMarker/PDF approval:
   - Ask separately before SDF deployment or changing the NetSuite account.`;
let bridgeSocket = null;
let bridgeConnecting = null;
let bridgeBuffer = "";
let requestId = 0;
let selectedContext = null;
const pending = new Map();
function attachBridgeHandlers(socket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
        bridgeBuffer += chunk;
        const lines = bridgeBuffer.split("\n");
        bridgeBuffer = lines.pop() ?? "";
        for (const line of lines) {
            if (!line.trim())
                continue;
            let message;
            try {
                message = JSON.parse(line);
            }
            catch {
                continue;
            }
            const entry = pending.get(message.requestId);
            if (!entry)
                continue;
            pending.delete(message.requestId);
            clearTimeout(entry.timer);
            entry.resolve(message);
        }
    });
    socket.on("close", () => {
        if (bridgeSocket === socket)
            bridgeSocket = null;
        bridgeBuffer = "";
        for (const entry of pending.values()) {
            clearTimeout(entry.timer);
            entry.reject(new Error("Magic NetSuite native bridge disconnected."));
        }
        pending.clear();
    });
}
function connectNativeBridge() {
    if (bridgeSocket && !bridgeSocket.destroyed) {
        return Promise.resolve(bridgeSocket);
    }
    if (bridgeConnecting)
        return bridgeConnecting;
    const connecting = new Promise((resolve, reject) => {
        const socket = net.createConnection(BRIDGE_PIPE_PATH);
        let settled = false;
        const timer = setTimeout(() => {
            socket.destroy();
            if (!settled) {
                settled = true;
                reject(new Error("Open the Magic NetSuite extension MCP Server page and enable the bridge."));
            }
        }, 2500);
        socket.once("connect", () => {
            clearTimeout(timer);
            settled = true;
            bridgeSocket = socket;
            attachBridgeHandlers(socket);
            resolve(socket);
        });
        socket.once("error", (err) => {
            clearTimeout(timer);
            socket.destroy();
            if (!settled) {
                settled = true;
                reject(new Error(`Magic NetSuite native bridge is not connected: ${err.message}`));
            }
        });
    });
    bridgeConnecting = connecting;
    connecting.finally(() => {
        bridgeConnecting = null;
    });
    return connecting;
}
async function callExtensionTool(name, args = {}) {
    const socket = await connectNativeBridge();
    const id = ++requestId;
    const response = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`Timed out while running ${name}.`));
        }, 30000);
        pending.set(id, { resolve, reject, timer });
        socket.write(JSON.stringify({
            requestId: id,
            method: "tools/call",
            params: { name, arguments: args },
        }) + "\n");
    });
    if (!response.success) {
        throw new Error(response.error || `Magic NetSuite tool ${name} failed.`);
    }
    return (response.result ?? {});
}
function parseToolJson(result) {
    const text = result.content?.find((item) => item.type === "text")?.text;
    if (!text)
        return result.structuredContent ?? {};
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
function rowsFrom(value) {
    if (Array.isArray(value))
        return value.filter(isRecord);
    if (!isRecord(value))
        return [];
    for (const key of ["results", "recordTypes", "files", "folders", "subfolders", "records", "rows", "items"]) {
        const nested = value[key];
        if (Array.isArray(nested))
            return nested.filter(isRecord);
        const rows = rowsFrom(nested);
        if (rows.length)
            return rows;
    }
    return [];
}
function isRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function escapeSuiteQL(value) {
    return value.replace(/'/g, "''");
}
function isNumeric(value) {
    return /^\d+$/.test(value.trim());
}
const TRANSACTION_TYPES = {
    salesorder: "SalesOrd",
    invoice: "CustInvc",
    purchaseorder: "PurchOrd",
    vendorbill: "VendBill",
    estimate: "Estimate",
    creditmemo: "CustCred",
    journalentry: "Journal",
    itemfulfillment: "ItemShip",
    cashsale: "CashSale",
};
function recordSearchQueries(recordType, query, limit) {
    const cleanType = recordType.replace(/[^a-z0-9_]/gi, "");
    const cleanQuery = query.trim();
    const rowLimit = Math.max(1, Math.min(100, limit));
    if (TRANSACTION_TYPES[cleanType]) {
        const conditions = [`type = '${TRANSACTION_TYPES[cleanType]}'`, `ROWNUM <= ${rowLimit}`];
        if (cleanQuery) {
            const search = escapeSuiteQL(cleanQuery);
            conditions.push(isNumeric(cleanQuery)
                ? `(id = ${Number(cleanQuery)} OR LOWER(tranid) LIKE LOWER('%${search}%'))`
                : `LOWER(tranid) LIKE LOWER('%${search}%')`);
        }
        return [
            `SELECT id, tranid, BUILTIN.DF(entity) AS entity, trandate FROM transaction WHERE ${conditions.join(" AND ")} ORDER BY id DESC`,
        ];
    }
    const searchClause = (fields) => {
        const parts = [`ROWNUM <= ${rowLimit}`];
        if (cleanQuery) {
            const search = escapeSuiteQL(cleanQuery);
            const matches = fields.map((field) => `LOWER(${field}) LIKE LOWER('%${search}%')`);
            if (isNumeric(cleanQuery))
                matches.unshift(`id = ${Number(cleanQuery)}`);
            parts.push(`(${matches.join(" OR ")})`);
        }
        return parts.join(" AND ");
    };
    return [
        `SELECT id, name FROM ${cleanType} WHERE ${searchClause(["name"])} ORDER BY id DESC`,
        `SELECT id, entityid, altname FROM ${cleanType} WHERE ${searchClause(["entityid", "altname"])} ORDER BY id DESC`,
        `SELECT id, scriptid, name FROM ${cleanType} WHERE ${searchClause(["scriptid", "name"])} ORDER BY id DESC`,
        `SELECT id FROM ${cleanType} WHERE ROWNUM <= ${rowLimit} ORDER BY id DESC`,
    ];
}
async function runSuiteQLRows(sql) {
    const result = await callExtensionTool("suiteql_execute_query", { sql });
    return rowsFrom(parseToolJson(result));
}
function toLabel(row) {
    return String(row.name ?? row.entityid ?? row.altname ?? row.tranid ?? row.scriptid ?? row.displayname ?? `#${row.id ?? ""}`).trim();
}
function toNumberOrNull(value) {
    if (value === null || value === undefined || value === "")
        return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}
function mapFolderRow(row) {
    return {
        type: "folder",
        id: Number(row.id),
        name: String(row.name ?? ""),
        parent: toNumberOrNull(row.parent),
        foldertype: String(row.foldertype ?? "DEFAULT"),
        numfolderfiles: Number(row.numfolderfiles ?? row.numFolderFiles ?? 0),
        foldersize: Number(row.foldersize ?? row.folderSize ?? 0),
        lastmodifieddate: row.lastmodifieddate == null ? null : String(row.lastmodifieddate),
        description: row.description == null ? undefined : String(row.description),
    };
}
function mapFileRow(row) {
    return {
        type: "file",
        id: Number(row.id),
        name: String(row.name ?? ""),
        filetype: String(row.filetype ?? row.fileType ?? ""),
        filesize: Number(row.filesize ?? row.fileSize ?? 0),
        folder: Number(row.folder ?? 0),
        lastmodifieddate: row.lastmodifieddate == null ? null : String(row.lastmodifieddate),
        createddate: row.createddate == null ? undefined : String(row.createddate),
        description: row.description == null ? undefined : String(row.description),
        url: row.url == null ? undefined : String(row.url),
    };
}
async function fetchFolderInfo(folderId) {
    const rows = await runSuiteQLRows(`
    SELECT id, name, parent, foldertype, numFolderFiles, folderSize, lastModifiedDate, description
    FROM MediaItemFolder
    WHERE id = ${folderId} AND ROWNUM <= 1
  `);
    return rows.length > 0 ? mapFolderRow(rows[0]) : null;
}
async function buildFolderBreadcrumbs(folderId) {
    if (folderId === null)
        return [];
    const breadcrumbs = [];
    let current = folderId;
    for (let i = 0; i < 20 && current !== null; i += 1) {
        const rows = await runSuiteQLRows(`SELECT id, name, parent FROM MediaItemFolder WHERE id = ${current} AND ROWNUM <= 1`);
        if (rows.length === 0)
            break;
        const row = rows[0];
        breadcrumbs.unshift({ id: Number(row.id), name: String(row.name ?? row.id) });
        current = toNumberOrNull(row.parent);
    }
    return breadcrumbs;
}
function summarizeJson(value, maxChars = 22000) {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (text.length <= maxChars)
        return text;
    return `${text.slice(0, maxChars)}\n\n... [truncated ${text.length - maxChars} characters]`;
}
function toolResult(data, message = "Done.") {
    return {
        content: [{ type: "text", text: message }],
        structuredContent: isRecord(data) ? data : { value: data },
    };
}
function markdownToolResult(data, fallbackMessage) {
    return {
        content: [{ type: "text", text: data.markdown || fallbackMessage }],
        structuredContent: data,
    };
}
async function imagePathToDataUrl(filePath) {
    const normalized = filePath.trim();
    if (!normalized)
        return "";
    const buffer = await fs.readFile(normalized);
    const ext = path.extname(normalized).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
        ext === ".webp" ? "image/webp" :
            ext === ".gif" ? "image/gif" :
                "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
}
async function resolveTemplateHtml(html, htmlPath) {
    const explicitPath = String(htmlPath || "").trim();
    const value = String(html || "").trim();
    const candidatePath = explicitPath || (!value.includes("<") && /\.html?$/i.test(value) ? value : "");
    if (candidatePath) {
        try {
            return await fs.readFile(path.resolve(candidatePath), "utf8");
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`Could not load the HTML preview file "${candidatePath}": ${detail}`);
        }
    }
    if (!value)
        throw new Error("HTML content or htmlPath is required.");
    return value;
}
// Turn a Playwright ControlResult into an MCP tool result, attaching the
// screenshot (if any) as an image block so Claude can see the Suitelet.
function controlToolResult(data, okMessage) {
    const { screenshot, message, ...rest } = data;
    const result = toolResult(rest, message || okMessage);
    if (screenshot) {
        result.content.push({ type: "image", data: screenshot, mimeType: "image/jpeg" });
    }
    return result;
}
// Resolve a Suitelet target to an account-correct scriptlet.nl URL using the
// extension bridge (which can run SuiteQL against the logged-in account). The
// extension is never asked to OPEN anything here — only to resolve the URL.
async function resolveSuiteletUrl(args) {
    if (args.url) {
        return { url: args.url, name: "" };
    }
    // scriptId + deployId + known account origin -> build the URL directly. This
    // works even for Suitelets whose deployment is NOT marked "deployed" (the
    // stream_list lookup filters those out), which is common while testing.
    if (args.scriptId && args.deployId && args.origin) {
        const sid = encodeURIComponent(args.scriptId);
        const did = encodeURIComponent(args.deployId);
        return { url: `${args.origin}/app/site/hosting/scriptlet.nl?script=${sid}&deploy=${did}`, name: "" };
    }
    const query = args.query || args.scriptId || "";
    const data = parseToolJson(await callExtensionTool("netsuite_suitelet_stream_list", { query }));
    const suitelets = rowsFrom(data);
    if (!suitelets.length) {
        throw new Error(`No DEPLOYED Suitelet matched "${query}". The lookup only returns deployments marked Deployed — if this one is in Testing/undeployed, pass scriptId + deployId (and keep a NetSuite tab open for the account) to open it directly. Also confirm a NetSuite tab for the selected account is open so the bridge can resolve.`);
    }
    const needle = query.toLowerCase();
    const match = suitelets.find((s) => {
        if (args.scriptId && String(s.scriptId).toLowerCase() === args.scriptId.toLowerCase()) {
            return !args.deployId || String(s.deploymentId).toLowerCase() === args.deployId.toLowerCase();
        }
        return false;
    }) ||
        suitelets.find((s) => [s.scriptName, s.scriptId, s.deploymentScriptId]
            .map((v) => String(v ?? "").toLowerCase())
            .some((v) => v.includes(needle))) ||
        suitelets[0];
    const url = String(match.url ?? "");
    if (!url)
        throw new Error("Resolved Suitelet has no URL.");
    return { url, name: String(match.scriptName ?? "") };
}
// Pull the real NetSuite session cookies from the logged-in browser (via the
// extension's debugger) and map CDP cookie shape -> Playwright cookie shape, so
// Playwright reuses the session instead of logging in again.
async function getNetsuiteCookies() {
    try {
        const data = parseToolJson(await callExtensionTool("netsuite_dump_cookies"));
        const origin = isRecord(data) && typeof data.origin === "string" ? data.origin : "";
        const raw = isRecord(data) && Array.isArray(data.cookies) ? data.cookies : [];
        const mapped = [];
        for (const c of raw) {
            if (!isRecord(c) || !c.name || !c.domain)
                continue;
            const sameSiteRaw = String(c.sameSite ?? "");
            const sameSite = sameSiteRaw === "Strict" || sameSiteRaw === "Lax" || sameSiteRaw === "None" ? sameSiteRaw : undefined;
            const expires = typeof c.expires === "number" && c.expires > 0 ? c.expires : undefined;
            mapped.push({
                name: String(c.name),
                value: String(c.value ?? ""),
                domain: String(c.domain),
                path: String(c.path || "/"),
                ...(expires !== undefined ? { expires } : {}),
                httpOnly: Boolean(c.httpOnly),
                secure: Boolean(c.secure),
                ...(sameSite ? { sameSite } : {}),
            });
        }
        return { cookies: mapped, origin };
    }
    catch {
        // No NetSuite tab / dump failed — fall back to whatever session Playwright has.
        return { cookies: [], origin: "" };
    }
}
export function createServer() {
    const server = new McpServer({
        name: "Magic NetSuite MCP App",
        version: "1.0.0",
    });
    const resourceUri = "ui://magic-netsuite/context-picker.html";
    server.registerPrompt("open_context_picker", {
        title: "Open Magic NetSuite Context Picker",
        description: "Open the Magic NetSuite context picker MCP App for selecting records and File Cabinet files.",
        argsSchema: {
            initialTab: z.enum(["records", "files"]).optional(),
        },
    }, ({ initialTab = "records" }) => ({
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Open the Magic NetSuite context picker using magic_netsuite_context_picker with initialTab "${initialTab}".`,
                },
            },
        ],
    }));
    server.registerPrompt("open_suitelet_viewer", {
        title: "Open Magic NetSuite Suitelet Viewer",
        description: "Open the Magic NetSuite MCP App Suitelet viewer for interactive Suitelet streaming.",
        argsSchema: {
            url: z.string().optional(),
        },
    }, ({ url = "" }) => ({
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Open the Magic NetSuite Suitelet viewer using magic_netsuite_suitelet_viewer${url ? ` with url "${url}"` : ""}.`,
                },
            },
        ],
    }));
    server.registerPrompt("open_freemarker_preview", {
        title: "Open Magic NetSuite FreeMarker Preview",
        description: "Open the guarded FreeMarker renderer preview MCP App for HTML approval before conversion.",
        argsSchema: {
            html: z.string(),
            title: z.string().optional(),
            recordType: z.string().optional(),
            recordId: z.string().optional(),
            deployIfMissing: z.boolean().optional(),
        },
    }, ({ html, title = "FreeMarker Preview", recordType = "", recordId = "", deployIfMissing = false }) => ({
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Open the Magic NetSuite FreeMarker preview using magic_netsuite_freemarker_preview_html with arguments ${JSON.stringify({
                        html,
                        title,
                        recordType,
                        recordId,
                        deployIfMissing,
                    })}.`,
                },
            },
        ],
    }));
    registerAppTool(server, "magic_netsuite_context_picker", {
        title: "Magic NetSuite Context Picker",
        description: "Open an interactive picker for NetSuite records and File Cabinet files, then load the selected context into Claude chat.",
        inputSchema: {
            initialTab: z.enum(["records", "files"]).optional().describe("Which picker tab to open first."),
        },
        _meta: { ui: { resourceUri } },
    }, async ({ initialTab = "records" }) => toolResult({ initialTab }, "Use the picker below to select NetSuite context for Claude."));
    registerAppTool(server, "magic_netsuite_suitelet_viewer", {
        title: "Magic NetSuite Suitelet Viewer",
        description: "Open an interactive MCP App viewer that streams a NetSuite Suitelet tab and forwards clicks, wheel events, and keyboard input back to Chrome.",
        inputSchema: {
            url: z.string().optional().describe("Optional Suitelet URL to open. If omitted, the viewer uses the preferred/current NetSuite tab."),
        },
        _meta: { ui: { resourceUri } },
    }, async ({ url = "" }) => toolResult({ mode: "suitelet", url }, "Use the viewer below to stream and interact with a NetSuite Suitelet."));
    registerAppTool(server, "magic_netsuite_freemarker_preview_html", {
        title: "FreeMarker HTML Preview",
        description: "Create and open a guarded FreeMarker renderer preview. First shows HTML for user approval; conversion tools refuse to run until the preview is approved. If renderer components are missing, ask the user before retrying with deployIfMissing:true.",
        inputSchema: {
            html: z.string().describe("HTML preview to show before conversion."),
            title: z.string().optional(),
            recordType: z.string().optional(),
            recordId: z.string().optional(),
            deployIfMissing: z.boolean().optional(),
        },
        _meta: { ui: { resourceUri } },
    }, async ({ html, title = "FreeMarker Preview", recordType = "", recordId = "", deployIfMissing = false }) => {
        const data = parseToolJson(await callExtensionTool("netsuite_freemarker_preview_html", {
            html,
            title,
            recordType,
            recordId,
            deployIfMissing,
        }));
        const structured = isRecord(data) ? data : { value: data };
        if (structured.needsDeploymentApproval) {
            return toolResult(structured, "FreeMarker renderer components are not deployed. Ask the user whether to deploy them; if refused, stop.");
        }
        return toolResult({ ...structured, mode: "freemarker" }, "Use the preview below to approve the HTML before FreeMarker conversion.");
    });
    server.registerTool("magic_netsuite_recreate_template_workflow", {
        title: "Start NetSuite Template Recreation Workflow",
        description: "CALL THIS FIRST whenever the user asks to recreate, clone, match, or build an invoice/template for NetSuite. The guarded flow is: load the FreeMarker/BFO skill, reproduce the reference in compatible HTML, iterate visually, approve HTML, convert and print through NetSuite, iterate on FreeMarker/PDF, then approve final output before optional deployment.",
        inputSchema: {
            recordType: z.string().optional().describe("Target NetSuite record type, e.g. invoice."),
            designName: z.string().optional().describe("Short label for the source design/template."),
        },
    }, async ({ recordType = "invoice", designName = "NetSuite template" }) => {
        let skillMatches = null;
        try {
            skillMatches = parseToolJson(await callExtensionTool("magic_netsuite_search_skills", {
                query: "netsuite freemarker advanced pdf bfo template",
                includeDisabled: false,
            }));
        }
        catch {
            skillMatches = { unavailable: true };
        }
        return toolResult({
            recordType,
            designName,
            workflow: NETSUITE_TEMPLATE_RECREATION_WORKFLOW,
            requiredNextAction: "Load the most relevant skill from skillMatches before writing the local template.",
            previewTool: "magic_netsuite_template_preview_playwright",
            reviewWaitTool: "magic_netsuite_template_review_wait",
            forbiddenUntilApproval: [
                "magic_netsuite_freemarker_convert_approved",
                "netsuite_sdf_deploy",
                "magic_netsuite_deploy_server_components",
                "NetSuite upload/deploy/render",
            ],
            skillMatches,
        }, "Skill search is complete. Load the best matching NetSuite FreeMarker/BFO skill, then build and preview a local template before any conversion, render, upload, or deploy.");
    });
    function pdfDataUrlFromRenderResult(value) {
        if (!isRecord(value))
            return { pdfDataUrl: "", renderError: value ? "NetSuite returned an invalid PDF render result." : "" };
        if (value.success === false || value.error) {
            return { pdfDataUrl: "", renderError: String(value.error || "NetSuite PDF rendering failed.") };
        }
        const pdf = typeof value.pdf === "string" ? value.pdf.trim() : "";
        if (!pdf)
            return { pdfDataUrl: "", renderError: "NetSuite did not return PDF data." };
        const mimeType = typeof value.mimeType === "string" && value.mimeType ? value.mimeType : "application/pdf";
        return {
            pdfDataUrl: pdf.startsWith("data:") ? pdf : `data:${mimeType};base64,${pdf}`,
            renderError: "",
        };
    }
    function appendTemplateArtifactImages(result, preview) {
        const htmlScreenshot = typeof preview.htmlScreenshot === "string" ? preview.htmlScreenshot : "";
        const pdfScreenshot = typeof preview.pdfScreenshot === "string" ? preview.pdfScreenshot : "";
        if (htmlScreenshot)
            result.content.push({ type: "image", data: htmlScreenshot, mimeType: "image/jpeg" });
        if (pdfScreenshot)
            result.content.push({ type: "image", data: pdfScreenshot, mimeType: "image/jpeg" });
    }
    async function finishTemplateReviewAction(opts) {
        const { timeoutMs = 900000, convertOnApprove = true, deployIfMissing = false, renderPdf = true, recordType = "", recordId = "", } = opts;
        const review = await playwrightController.waitTemplateReview(timeoutMs);
        if (review.status === "done") {
            return toolResult({
                ok: true,
                reviewId: review.reviewId,
                status: "done",
                feedback: review.feedback,
                html: review.html,
                freemarker: review.freemarker,
            }, "Template review ended by the user.");
        }
        if (review.status === "freemarker_approved") {
            return toolResult({
                ok: true,
                reviewId: review.reviewId,
                status: review.status,
                feedback: review.feedback,
                freemarker: review.freemarker,
                pdfReady: Boolean(review.pdfDataUrl),
            }, "The user approved the generated FreeMarker output. The review workflow is complete; deployment still requires separate explicit permission.");
        }
        if (review.status === "html_changes_requested") {
            return toolResult({
                ok: true,
                reviewId: review.reviewId,
                status: review.status,
                feedback: review.feedback,
                html: review.html,
            }, "The user requested HTML fixes. Apply them using the loaded NetSuite FreeMarker/BFO skill, then call magic_netsuite_template_review_update with the revised html.");
        }
        if (review.status === "freemarker_changes_requested") {
            return toolResult({
                ok: true,
                reviewId: review.reviewId,
                status: review.status,
                feedback: review.feedback,
                freemarker: review.freemarker,
                sessionId: review.sessionId,
            }, "The user requested FreeMarker/PDF fixes. Revise the BFO-safe FreeMarker using the loaded skill, then call magic_netsuite_template_review_update with freemarker and rerenderFreemarker:true.");
        }
        if (review.status !== "html_approved") {
            return toolResult({ ...review }, `Template review is currently ${review.status}.`);
        }
        if (!convertOnApprove) {
            return toolResult({ ...review }, "HTML was approved. Call magic_netsuite_template_review_wait with convertOnApprove:true to continue to FreeMarker.");
        }
        const effectiveRecordType = recordType || String(review.recordType ?? "");
        const effectiveRecordId = recordId || String(review.recordId ?? "");
        await playwrightController.updateTemplateReview({ status: "converting", renderError: "", feedback: "" });
        try {
            const previewData = parseToolJson(await callExtensionTool("netsuite_freemarker_preview_html", {
                html: String(review.html ?? ""),
                title: String(review.title ?? "NetSuite Template Preview"),
                recordType: effectiveRecordType,
                recordId: effectiveRecordId,
                deployIfMissing,
            }));
            const previewStructured = isRecord(previewData) ? previewData : { value: previewData };
            if (previewStructured.needsDeploymentApproval) {
                const message = "Renderer server components are missing. Ask the user for deployment approval before converting.";
                await playwrightController.updateTemplateReview({ renderError: message, status: "render_error" });
                return toolResult(previewStructured, message);
            }
            const sessionId = String(previewStructured.sessionId ?? "");
            if (!sessionId)
                throw new Error("FreeMarker preview session did not return a sessionId.");
            await callExtensionTool("netsuite_freemarker_set_approval", { sessionId, approved: true, feedback: String(review.feedback ?? "") });
            const convertedData = parseToolJson(await callExtensionTool("netsuite_freemarker_convert_approved", {
                sessionId,
                renderPdf: renderPdf && Boolean(effectiveRecordType && effectiveRecordId),
                recordType: effectiveRecordType,
                recordId: effectiveRecordId,
            }));
            const converted = isRecord(convertedData) ? convertedData : { value: convertedData };
            const freemarker = typeof converted.freemarker === "string" ? converted.freemarker : JSON.stringify(converted, null, 2);
            const rendered = pdfDataUrlFromRenderResult(converted.renderResult);
            if (!effectiveRecordId && renderPdf)
                rendered.renderError = "Select a NetSuite record ID to generate the PDF preview.";
            await playwrightController.updateTemplateReview({
                freemarker,
                pdfDataUrl: rendered.pdfDataUrl,
                renderError: rendered.renderError,
                sessionId,
                status: "freemarker_review",
                feedback: "",
            });
            // Rendering is not completion. Keep this same guarded request alive until
            // the user explicitly approves the FreeMarker/PDF or asks for another fix.
            return finishTemplateReviewAction({
                ...opts,
                recordType: effectiveRecordType,
                recordId: effectiveRecordId,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await playwrightController.updateTemplateReview({ status: "render_error", renderError: message });
            throw error;
        }
    }
    function templateReviewOptionContext(recordType = "", recordId = "") {
        const recordTypes = new Set();
        const recordIds = new Set();
        if (recordType)
            recordTypes.add(recordType);
        if (recordId)
            recordIds.add(recordId);
        for (const item of selectedContext?.selectedItems ?? []) {
            if (item.recordType)
                recordTypes.add(item.recordType);
            if (item.id)
                recordIds.add(item.id);
        }
        if (!recordTypes.size)
            recordTypes.add("invoice");
        return {
            recordTypeOptions: [...recordTypes],
            recordIdOptions: [...recordIds],
        };
    }
    async function loadTemplateReviewRecordOptions(recordType = "invoice") {
        const fallback = templateReviewOptionContext(recordType, "");
        const recordTypes = new Set(fallback.recordTypeOptions);
        const recordIds = new Set();
        const recordTypeLabels = {};
        const recordIdLabels = {};
        try {
            const data = parseToolJson(await callExtensionTool("netsuite_list_record_types"));
            for (const row of rowsFrom(data)) {
                const id = String(row.id ?? row.scriptId ?? "").trim().toLowerCase();
                if (id) {
                    recordTypes.add(id);
                    recordTypeLabels[id] = String(row.name ?? row.label ?? row.id ?? id);
                }
            }
        }
        catch {
            /* Keep the current type available when the extension is temporarily offline. */
        }
        let lastError = "";
        for (const sql of recordSearchQueries(recordType || "invoice", "", 100)) {
            try {
                const rows = await runSuiteQLRows(sql);
                for (const row of rows) {
                    const id = String(row.id ?? row.ID ?? "").trim();
                    if (id) {
                        recordIds.add(id);
                        recordIdLabels[id] = toLabel(row);
                    }
                }
                if (rows.length || sql.includes("SELECT id FROM"))
                    break;
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
            }
        }
        if (!recordIds.size && lastError) {
            // An empty list is valid; the editable ID input remains available.
        }
        return {
            recordTypeOptions: [...recordTypes].sort((a, b) => a.localeCompare(b)),
            recordIdOptions: [...recordIds],
            recordTypeLabels,
            recordIdLabels,
        };
    }
    playwrightController.setTemplateRecordOptionsResolver(loadTemplateReviewRecordOptions);
    server.registerTool("magic_netsuite_template_preview_playwright", {
        title: "Review Local NetSuite Template in Playwright",
        description: "Open the professional Reference → HTML → FreeMarker → NetSuite PDF → Final Approval workflow. For recreation from an image, forward the prompt attachment with referenceImagePath or referenceImageDataUrl; missing references are rejected by default instead of silently opening an empty panel.",
        inputSchema: {
            html: z.string().describe("Self-contained local preview HTML or BFO-safe template preview."),
            htmlPath: z.string().optional().describe("Absolute path to a local HTML preview file. Prefer this over passing the path in html."),
            title: z.string().optional(),
            templateFile: z.string().optional().describe("Template file name to show in the review header."),
            referenceImagePath: z.string().optional().describe("Optional local image path for the source image used in the prompt."),
            referenceImageDataUrl: z.string().optional().describe("Optional data URL for the source image used in the prompt."),
            referenceImageUrl: z.string().optional().describe("Optional URL/path for the source image used in the prompt."),
            allowMissingReference: z.boolean().optional().describe("Allow opening without a source reference. Defaults to false."),
            waitForAction: z.boolean().optional().describe("Wait for Approve/Send Fixes before returning. Defaults to false so the initial call returns a screenshot and review ID without MCP timeout/retry duplication."),
            timeoutMs: z.number().optional(),
            convertOnApprove: z.boolean().optional().describe("Convert automatically after HTML approval. Defaults to true."),
            deployIfMissing: z.boolean().optional(),
            renderPdf: z.boolean().optional().describe("Render the converted template with NetSuite print tooling. Defaults to true."),
            recordType: z.string().optional(),
            recordId: z.string().optional(),
            recordTypeOptions: z.array(z.string()).optional(),
            recordIdOptions: z.array(z.string()).optional(),
        },
    }, async ({ html, htmlPath = "", title = "NetSuite Template Preview", templateFile = "invoice_template.ftl", referenceImagePath = "", referenceImageDataUrl = "", referenceImageUrl = "", allowMissingReference = false, waitForAction = false, timeoutMs = 900000, convertOnApprove = true, deployIfMissing = false, renderPdf = true, recordType = "", recordId = "", recordTypeOptions, recordIdOptions, }) => {
        const resolvedHtml = await resolveTemplateHtml(html, htmlPath);
        const resolvedReferenceImageDataUrl = referenceImageDataUrl || (referenceImagePath ? await imagePathToDataUrl(referenceImagePath) : "");
        if (!allowMissingReference && !resolvedReferenceImageDataUrl && !referenceImageUrl) {
            throw new Error("A source reference image is required for template recreation. Forward the prompt attachment as referenceImagePath or referenceImageDataUrl (or set allowMissingReference:true for a reference-free workflow).");
        }
        const optionContext = templateReviewOptionContext(recordType, recordId);
        const selectedRecordType = recordType || (optionContext.recordTypeOptions.length === 1 ? optionContext.recordTypeOptions[0] : "invoice");
        const selectedRecordId = recordId || (optionContext.recordIdOptions.length === 1 ? optionContext.recordIdOptions[0] : "");
        const liveOptions = await loadTemplateReviewRecordOptions(selectedRecordType);
        if (selectedRecordId && !liveOptions.recordIdOptions.includes(selectedRecordId))
            liveOptions.recordIdOptions.unshift(selectedRecordId);
        const preview = await playwrightController.openTemplateReview({
            html: resolvedHtml,
            title,
            templateFile,
            recordType: selectedRecordType,
            recordId: selectedRecordId,
            recordTypeOptions: recordTypeOptions?.length ? recordTypeOptions : liveOptions.recordTypeOptions,
            recordIdOptions: recordIdOptions?.length ? recordIdOptions : liveOptions.recordIdOptions,
            recordTypeLabels: liveOptions.recordTypeLabels,
            recordIdLabels: liveOptions.recordIdLabels,
            referenceImageDataUrl: resolvedReferenceImageDataUrl,
            referenceImageUrl,
        });
        if (waitForAction) {
            return finishTemplateReviewAction({
                timeoutMs,
                convertOnApprove,
                deployIfMissing,
                renderPdf,
                recordType: selectedRecordType,
                recordId: selectedRecordId,
            });
        }
        const result = toolResult({
            ok: preview.ok,
            reviewId: preview.reviewId,
            title: preview.title,
            status: preview.status,
            feedback: preview.feedback,
            referenceLoaded: preview.referenceLoaded,
        }, "Template review opened in Playwright. Call magic_netsuite_template_review_wait next; it will return when the user clicks Approve or Send Fixes.");
        appendTemplateArtifactImages(result, preview);
        return result;
    });
    server.registerTool("magic_netsuite_template_review_update", {
        title: "Update Playwright Template Review",
        description: "Live-update the already-open Playwright template review after applying fixes. Keeps the same browser window and refreshes the rendered HTML/reference/FreeMarker pane.",
        inputSchema: {
            html: z.string().optional(),
            htmlPath: z.string().optional(),
            title: z.string().optional(),
            templateFile: z.string().optional(),
            referenceImagePath: z.string().optional(),
            referenceImageDataUrl: z.string().optional(),
            referenceImageUrl: z.string().optional(),
            freemarker: z.string().optional(),
            rerenderFreemarker: z.boolean().optional().describe("Render the supplied/current FreeMarker through NetSuite and return to FreeMarker/PDF review."),
            changeSummary: z.string().optional().describe("Concise description of the changes applied from the user's feedback. Shown as the agent response in Review history."),
            feedback: z.string().optional(),
            waitForAction: z.boolean().optional().describe("Wait for Approve/Send Fixes before returning. Defaults to false."),
            timeoutMs: z.number().optional(),
            convertOnApprove: z.boolean().optional(),
            deployIfMissing: z.boolean().optional(),
            renderPdf: z.boolean().optional(),
            recordType: z.string().optional(),
            recordId: z.string().optional(),
            recordTypeOptions: z.array(z.string()).optional(),
            recordIdOptions: z.array(z.string()).optional(),
        },
    }, async (args) => {
        const resolvedHtml = args.html !== undefined || args.htmlPath ? await resolveTemplateHtml(args.html, args.htmlPath) : undefined;
        const resolvedReferenceImageDataUrl = args.referenceImageDataUrl || (args.referenceImagePath ? await imagePathToDataUrl(args.referenceImagePath) : undefined);
        const hasOptionSource = Boolean(args.recordType || args.recordId || args.recordTypeOptions?.length || args.recordIdOptions?.length || selectedContext?.selectedItems?.length);
        const optionContext = hasOptionSource ? templateReviewOptionContext(args.recordType, args.recordId) : { recordTypeOptions: [], recordIdOptions: [] };
        const current = playwrightController.templateReviewState();
        const wasHtmlFix = current.status === "html_changes_requested" && Boolean(resolvedHtml);
        const wasFreemarkerFix = current.status === "freemarker_changes_requested" && Boolean(args.freemarker || args.rerenderFreemarker);
        let freemarker = args.freemarker;
        let pdfDataUrl;
        let renderError;
        let sessionId = typeof current.sessionId === "string" ? current.sessionId : "";
        let nextStatus = resolvedHtml ? "html_review" : undefined;
        if (args.rerenderFreemarker) {
            freemarker = freemarker || (typeof current.freemarker === "string" ? current.freemarker : "");
            if (!freemarker.trim())
                throw new Error("freemarker is required for NetSuite rerendering.");
            if (!sessionId)
                throw new Error("The approved FreeMarker session could not be recovered; approve the HTML stage again.");
            const effectiveRecordType = args.recordType || String(current.recordType || "");
            const effectiveRecordId = args.recordId || String(current.recordId || "");
            if (!effectiveRecordType || !effectiveRecordId)
                throw new Error("recordType and recordId are required for NetSuite PDF rendering.");
            try {
                const rerenderedData = parseToolJson(await callExtensionTool("netsuite_freemarker_convert_approved", {
                    sessionId,
                    freemarker,
                    renderPdf: true,
                    recordType: effectiveRecordType,
                    recordId: effectiveRecordId,
                }));
                const rerendered = isRecord(rerenderedData) ? rerenderedData : { value: rerenderedData };
                const rendered = pdfDataUrlFromRenderResult(rerendered.renderResult);
                pdfDataUrl = rendered.pdfDataUrl;
                renderError = rendered.renderError;
                nextStatus = "freemarker_review";
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await playwrightController.updateTemplateReview({ freemarker, status: "render_error", renderError: message });
                throw error;
            }
        }
        else if (args.freemarker) {
            nextStatus = "freemarker_review";
        }
        const currentComments = (Array.isArray(current.comments) ? current.comments : []).map((comment, index) => {
            if (!isRecord(comment) || typeof comment.id === "string")
                return comment;
            return { ...comment, id: `history_${Date.now().toString(36)}_${index}` };
        });
        const responseText = String(args.changeSummary || "").trim() ||
            (wasHtmlFix ? "Updated the HTML preview from your requested changes." :
                wasFreemarkerFix ? "Updated the FreeMarker template and refreshed the NetSuite PDF preview." : "");
        const parentComment = currentComments.find((comment) => isRecord(comment) && comment.isYou === true && typeof comment.id === "string" &&
            !currentComments.some((candidate) => isRecord(candidate) && candidate.parentId === comment.id));
        const comments = responseText ? [{
                id: `response_${Date.now().toString(36)}`,
                parentId: isRecord(parentComment) ? String(parentComment.id || "") : undefined,
                initials: "AI",
                name: "Magic AI",
                time: new Date().toLocaleString(),
                text: responseText,
                color: "purple",
                isYou: false,
            }, ...currentComments] : undefined;
        const preview = await playwrightController.updateTemplateReview({
            html: resolvedHtml,
            title: args.title,
            templateFile: args.templateFile,
            recordType: args.recordType,
            recordId: args.recordId,
            recordTypeOptions: args.recordTypeOptions?.length ? args.recordTypeOptions : (hasOptionSource ? optionContext.recordTypeOptions : undefined),
            recordIdOptions: args.recordIdOptions?.length ? args.recordIdOptions : (hasOptionSource ? optionContext.recordIdOptions : undefined),
            referenceImageDataUrl: resolvedReferenceImageDataUrl,
            referenceImageUrl: args.referenceImageUrl,
            freemarker,
            pdfDataUrl,
            renderError,
            sessionId: sessionId || undefined,
            feedback: args.feedback ?? "",
            comments,
            status: nextStatus,
        });
        if (args.waitForAction === true) {
            return finishTemplateReviewAction({
                timeoutMs: args.timeoutMs,
                convertOnApprove: args.convertOnApprove,
                deployIfMissing: args.deployIfMissing,
                renderPdf: args.renderPdf,
                recordType: args.recordType,
                recordId: args.recordId,
            });
        }
        const result = toolResult({
            ok: preview.ok,
            reviewId: preview.reviewId,
            title: preview.title,
            status: preview.status,
            feedback: preview.feedback,
        }, "Template review updated in the existing Playwright window.");
        appendTemplateArtifactImages(result, preview);
        return result;
    });
    server.registerTool("magic_netsuite_template_review_wait", {
        title: "Wait for Template Review Action",
        description: "Wait for the current HTML or FreeMarker/PDF review action. HTML approval automatically advances through guarded conversion and NetSuite rendering, then this same call keeps waiting for explicit final FreeMarker/PDF approval. Rendering alone never completes the workflow; stage-specific fixes return the correct artifact and feedback to the agent.",
        inputSchema: {
            timeoutMs: z.number().optional(),
            convertOnApprove: z.boolean().optional().describe("Create/approve/convert the FreeMarker session after HTML approval. Defaults to true."),
            deployIfMissing: z.boolean().optional(),
            renderPdf: z.boolean().optional().describe("Render with NetSuite print tooling after conversion. Defaults to true."),
            recordType: z.string().optional(),
            recordId: z.string().optional(),
        },
    }, async ({ timeoutMs = 900000, convertOnApprove = true, deployIfMissing = false, renderPdf = true, recordType = "", recordId = "" }) => finishTemplateReviewAction({
        timeoutMs,
        convertOnApprove,
        deployIfMissing,
        renderPdf,
        recordType,
        recordId,
    }));
    server.registerTool("magic_netsuite_freemarker_preview_playwright", {
        title: "Preview FreeMarker HTML in Playwright",
        description: "Use only after the user explicitly wants the guarded FreeMarker renderer approval session. For normal 'recreate this NetSuite template' work, call magic_netsuite_recreate_template_workflow first and use magic_netsuite_template_preview_playwright for local visual iteration.",
        inputSchema: {
            html: z.string().describe("BFO-safe HTML preview to show before conversion."),
            title: z.string().optional(),
            recordType: z.string().optional(),
            recordId: z.string().optional(),
            deployIfMissing: z.boolean().optional(),
        },
    }, async ({ html, title = "FreeMarker Preview", recordType = "", recordId = "", deployIfMissing = false }) => {
        const data = parseToolJson(await callExtensionTool("netsuite_freemarker_preview_html", {
            html,
            title,
            recordType,
            recordId,
            deployIfMissing,
        }));
        const structured = isRecord(data) ? data : { value: data };
        if (structured.needsDeploymentApproval) {
            return toolResult(structured, "FreeMarker renderer components are not deployed. Ask the user whether to deploy them; if refused, stop.");
        }
        const previewHtml = typeof structured.html === "string" ? structured.html : html;
        const preview = await playwrightController.previewHtml(previewHtml, title);
        const result = toolResult({
            ...structured,
            playwright: {
                ok: preview.ok,
                title: preview.title,
                url: preview.url,
                bodyTextLength: preview.bodyTextLength,
                documentHeight: preview.documentHeight,
                documentWidth: preview.documentWidth,
            },
        }, "FreeMarker HTML preview opened in Playwright. Inspect the screenshot, then wait for explicit user approval before converting.");
        if (preview.screenshot) {
            result.content.push({ type: "image", data: preview.screenshot, mimeType: "image/jpeg" });
        }
        return result;
    });
    server.registerTool("magic_netsuite_bridge_status", {
        title: "Magic NetSuite Bridge Status",
        description: "Check whether the Magic NetSuite extension native bridge is reachable.",
        inputSchema: {},
    }, async () => {
        await connectNativeBridge();
        return toolResult({ connected: true, pipe: BRIDGE_PIPE_PATH }, "Magic NetSuite bridge is connected.");
    });
    server.registerTool("magic_netsuite_freemarker_set_approval", {
        title: "Set FreeMarker Preview Approval",
        description: "INTERNAL approval transport for the FreeMarker preview MCP App. Agents may also use it when relaying explicit user approval or fix feedback.",
        inputSchema: {
            sessionId: z.string(),
            approved: z.boolean(),
            feedback: z.string().optional(),
        },
    }, async ({ sessionId, approved, feedback = "" }) => {
        const data = parseToolJson(await callExtensionTool("netsuite_freemarker_set_approval", { sessionId, approved, feedback }));
        return toolResult(isRecord(data) ? data : { value: data }, approved ? "FreeMarker preview approved." : "FreeMarker preview feedback saved.");
    });
    server.registerTool("magic_netsuite_freemarker_approval_status", {
        title: "FreeMarker Preview Approval Status",
        description: "Read the approval status and any requested fixes for a FreeMarker preview session.",
        inputSchema: {
            sessionId: z.string(),
        },
    }, async ({ sessionId }) => {
        const data = parseToolJson(await callExtensionTool("netsuite_freemarker_approval_status", { sessionId }));
        return toolResult(isRecord(data) ? data : { value: data }, "FreeMarker preview status loaded.");
    });
    server.registerTool("magic_netsuite_freemarker_convert_approved", {
        title: "Convert Approved FreeMarker Preview",
        description: "POST-APPROVAL ONLY. Convert an already approved FreeMarker preview session into a FreeMarker Advanced PDF template and optionally render it. Never call this while recreating a design, before Playwright screenshot review, or before explicit user approval.",
        inputSchema: {
            sessionId: z.string(),
            renderPdf: z.boolean().optional(),
            freemarker: z.string().optional().describe("Optional revised FreeMarker/BFO source to render instead of regenerating from HTML."),
            recordType: z.string().optional(),
            recordId: z.string().optional(),
        },
    }, async ({ sessionId, renderPdf = true, freemarker, recordType, recordId }) => {
        const data = parseToolJson(await callExtensionTool("netsuite_freemarker_convert_approved", {
            sessionId,
            renderPdf,
            freemarker,
            recordType,
            recordId,
        }));
        if (!isRecord(data))
            return toolResult({ value: data }, "Approved FreeMarker preview converted.");
        const { renderResult, ...structured } = data;
        const rendered = pdfDataUrlFromRenderResult(renderResult);
        return toolResult({ ...structured, pdfReady: Boolean(rendered.pdfDataUrl), renderError: rendered.renderError }, "Approved FreeMarker preview converted.");
    });
    server.registerTool("magic_netsuite_save_skill", {
        title: "Save Magic NetSuite Skill",
        description: "Save or update a reusable Markdown skill in the Magic NetSuite extension skill library. Use this when the user asks to create a skill for Magic NetSuite; it will appear in the Vue Skills view and local harnesses.",
        inputSchema: {
            id: z.number().optional(),
            name: z.string().describe("Short skill name."),
            description: z.string().optional().describe("One-sentence search description."),
            tags: z.union([z.string(), z.array(z.string())]).optional().describe("Comma-separated tags or tag array."),
            content: z.string().optional().describe("Markdown skill content."),
            markdown: z.string().optional().describe("Alias for content."),
            domain: z.enum(["global", "sql"]).optional().describe("Skill scope. Defaults to global."),
            enabled: z.boolean().optional().describe("Whether the skill is enabled. Defaults to true."),
            upsertByName: z.boolean().optional().describe("Update a same-name skill if found. Defaults to true."),
        },
    }, async (args) => {
        const data = parseToolJson(await callExtensionTool("magic_netsuite_save_skill", args));
        return toolResult(isRecord(data) ? data : { value: data }, "Skill saved to Magic NetSuite.");
    });
    server.registerTool("magic_netsuite_list_skills", {
        title: "List Magic NetSuite Skills",
        description: "List skill metadata from the Magic NetSuite extension skill library.",
        inputSchema: {
            includeDisabled: z.boolean().optional().describe("Include disabled skills. Defaults to true."),
        },
    }, async (args) => {
        const data = parseToolJson(await callExtensionTool("magic_netsuite_list_skills", args));
        return toolResult(isRecord(data) ? data : { value: data }, "Skills listed.");
    });
    server.registerTool("magic_netsuite_search_skills", {
        title: "Search Magic NetSuite Skills",
        description: "Search the local Magic NetSuite skill library by name, description, and tags. Use this before external documentation for NetSuite, SuiteScript, FreeMarker, SuiteQL, UI workflow, or project-specific knowledge questions. Returns metadata only; load relevant results with magic_netsuite_load_skill.",
        inputSchema: {
            query: z.string().optional(),
            includeDisabled: z.boolean().optional(),
        },
    }, async (args) => {
        const data = parseToolJson(await callExtensionTool("magic_netsuite_search_skills", args));
        return toolResult(isRecord(data) ? data : { value: data }, "Skills searched.");
    });
    server.registerTool("magic_netsuite_load_skill", {
        title: "Load Magic NetSuite Skill",
        description: "Load one Magic NetSuite skill, including Markdown content, by ID.",
        inputSchema: {
            id: z.number().optional(),
            skillId: z.number().optional(),
        },
    }, async (args) => {
        const data = parseToolJson(await callExtensionTool("magic_netsuite_load_skill", args));
        return toolResult(isRecord(data) ? data : { value: data }, "Skill loaded.");
    });
    server.registerTool("magic_netsuite_set_skill_enabled", {
        title: "Enable or Disable Magic NetSuite Skill",
        description: "Enable or disable a Magic NetSuite skill by ID.",
        inputSchema: {
            id: z.number().optional(),
            skillId: z.number().optional(),
            enabled: z.boolean(),
        },
    }, async (args) => {
        const data = parseToolJson(await callExtensionTool("magic_netsuite_set_skill_enabled", args));
        return toolResult(isRecord(data) ? data : { value: data }, "Skill enabled state updated.");
    });
    server.registerTool("magic_netsuite_suitelet_stream_start", {
        title: "Start Suitelet Stream",
        description: "INTERNAL viewer transport for the MCP App UI — agents should NOT use this. To open and drive a Suitelet, use magic_netsuite_suitelet_control_open instead.",
        inputSchema: {
            url: z.string().optional(),
        },
    }, async ({ url = "" }) => {
        const data = parseToolJson(await callExtensionTool("netsuite_suitelet_stream_start", { url }));
        return toolResult(isRecord(data) ? data : { value: data }, "Suitelet stream started.");
    });
    server.registerTool("magic_netsuite_suitelet_stream_list", {
        title: "List Suitelets",
        description: "List deployed Suitelets available for the Magic NetSuite Suitelet Viewer MCP App.",
        inputSchema: {
            query: z.string().optional(),
        },
    }, async ({ query = "" }) => {
        const data = parseToolJson(await callExtensionTool("netsuite_suitelet_stream_list", { query }));
        return toolResult(isRecord(data) ? data : { value: data }, "Suitelets loaded.");
    });
    server.registerTool("magic_netsuite_suitelet_stream_frame", {
        title: "Get Suitelet Stream Frame",
        description: "INTERNAL viewer transport for the MCP App UI — agents should NOT use this. To see the controlled Suitelet, use magic_netsuite_suitelet_screenshot (or scroll/hover, which also return a screenshot).",
        inputSchema: {},
    }, async () => {
        const data = parseToolJson(await callExtensionTool("netsuite_suitelet_stream_frame"));
        return toolResult(isRecord(data) ? data : { value: data }, "Suitelet frame captured.");
    });
    server.registerTool("magic_netsuite_suitelet_stream_input", {
        title: "Send Suitelet Stream Input",
        description: "INTERNAL viewer transport for the MCP App UI (forwards raw coordinate mouse/wheel/key events) — agents should NOT use this; coordinate input is unreliable. Use the dedicated tools instead: magic_netsuite_suitelet_scroll, _hover, _click, _fill.",
        inputSchema: {
            event: z.record(z.string(), z.unknown()),
        },
    }, async ({ event }) => {
        const data = parseToolJson(await callExtensionTool("netsuite_suitelet_stream_input", { event }));
        return toolResult(isRecord(data) ? data : { value: data }, "Suitelet input sent.");
    });
    server.registerTool("magic_netsuite_suitelet_probe_url", {
        title: "Probe Suitelet URL",
        description: "Fetch a Suitelet URL from the Chrome extension and return diagnostics for blank iframe troubleshooting.",
        inputSchema: {
            url: z.string(),
        },
    }, async ({ url }) => {
        const data = parseToolJson(await callExtensionTool("netsuite_suitelet_probe_url", { url }));
        return toolResult(isRecord(data) ? data : { value: data }, "Suitelet URL probed.");
    });
    server.registerTool("magic_netsuite_suitelet_fetch_html", {
        title: "Fetch Suitelet HTML",
        description: "Fetch Suitelet HTML through the Chrome extension for srcdoc rendering in the MCP App.",
        inputSchema: {
            url: z.string(),
        },
    }, async ({ url }) => {
        const data = parseToolJson(await callExtensionTool("netsuite_suitelet_fetch_html", { url }));
        return toolResult(isRecord(data) ? data : { value: data }, "Suitelet HTML fetched.");
    });
    server.registerTool("magic_netsuite_suitelet_proxy_request", {
        title: "Proxy Suitelet Request",
        description: "Proxy a runtime Suitelet fetch/XHR request through the Chrome extension.",
        inputSchema: {
            url: z.string(),
            originalUrl: z.string().optional(),
            source: z.string().optional(),
            method: z.string().optional(),
            headers: z.record(z.string(), z.unknown()).optional(),
            body: z.string().nullable().optional(),
        },
    }, async ({ url, originalUrl, source, method = "GET", headers = {}, body = null }) => {
        const data = parseToolJson(await callExtensionTool("netsuite_suitelet_proxy_request", {
            url,
            originalUrl,
            source,
            method,
            headers,
            body,
        }));
        return toolResult(isRecord(data) ? data : { value: data }, "Suitelet request proxied.");
    });
    server.registerTool("magic_netsuite_suitelet_control_open", {
        title: "Open & Control Suitelet",
        description: "Open a Suitelet in a real NetSuite tab and attach the controller so Claude can inspect and drive it. PREFERRED: pass { query: \"<name>\" } (e.g. \"CTK SuiteQL\") — the correct account URL is resolved automatically; never guess a URL. Or pass { scriptId, deployId }, or a full scriptlet.nl url. Returns the matched Suitelet, a screenshot, and a snapshot of interactive elements.",
        inputSchema: {
            query: z.string().optional(),
            scriptId: z.string().optional(),
            deployId: z.string().optional(),
            url: z.string().optional(),
        },
    }, async ({ query, scriptId, deployId, url }) => {
        if (USE_PLAYWRIGHT) {
            // Cookies first — they also carry the preferred-account origin, which lets
            // us build scriptId+deployId URLs directly (works for non-deployed ones).
            const { cookies, origin } = await getNetsuiteCookies();
            const resolved = await resolveSuiteletUrl({ query, scriptId, deployId, url, origin });
            const data = await playwrightController.open(resolved.url, cookies, resolved.name);
            return controlToolResult(data, "Suitelet opened in Playwright for control.");
        }
        const openArgs = {};
        if (query)
            openArgs.query = query;
        if (scriptId)
            openArgs.scriptId = scriptId;
        if (deployId)
            openArgs.deployId = deployId;
        if (url)
            openArgs.url = url;
        const raw = await callExtensionTool("netsuite_suitelet_control_open", openArgs);
        const data = parseToolJson(raw);
        const result = toolResult(isRecord(data) ? data : { value: data }, "Suitelet opened for control.");
        // Forward the screenshot so Claude can SEE the opened Suitelet without reaching
        // for any other browser extension.
        const image = raw.content?.find((item) => item.type === "image" && item.data);
        if (image?.data) {
            result.content.push({ type: "image", data: image.data, mimeType: image.mimeType || "image/jpeg" });
        }
        return result;
    });
    server.registerTool("magic_netsuite_suitelet_inspect", {
        title: "Inspect Suitelet",
        description: "List visible interactive elements (inputs, textareas, selects, buttons, links) of the controlled Suitelet with CSS selectors and labels.",
        inputSchema: {},
    }, async () => {
        if (USE_PLAYWRIGHT) {
            return controlToolResult(await playwrightController.inspect(), "Suitelet inspected.");
        }
        const data = parseToolJson(await callExtensionTool("netsuite_suitelet_inspect"));
        return toolResult(isRecord(data) ? data : { value: data }, "Suitelet inspected.");
    });
    server.registerTool("magic_netsuite_suitelet_screenshot", {
        title: "Screenshot Suitelet",
        description: "Capture a screenshot of the controlled Suitelet tab so Claude can see it. Use this instead of any external/Claude-in-Chrome browser screenshot tool.",
        inputSchema: {},
    }, async () => {
        if (USE_PLAYWRIGHT) {
            return controlToolResult(await playwrightController.screenshot(), "Suitelet screenshot captured.");
        }
        const raw = await callExtensionTool("netsuite_suitelet_screenshot");
        const data = parseToolJson(raw);
        const result = toolResult(isRecord(data) ? data : { value: data }, "Suitelet screenshot captured.");
        const image = raw.content?.find((item) => item.type === "image" && item.data);
        if (image?.data) {
            result.content.push({ type: "image", data: image.data, mimeType: image.mimeType || "image/jpeg" });
        }
        return result;
    });
    server.registerTool("magic_netsuite_suitelet_hover", {
        title: "Hover in Suitelet",
        description: "Hover the mouse over an element (by CSS selector or x/y viewport coordinates) and return a screenshot. Triggers native :hover plus pointer/mouseover events so tooltips and hover menus appear.",
        inputSchema: {
            selector: z.string().optional(),
            x: z.number().optional(),
            y: z.number().optional(),
        },
    }, async ({ selector, x, y }) => {
        if (USE_PLAYWRIGHT) {
            return controlToolResult(await playwrightController.hover({ selector, x, y }), "Suitelet hovered.");
        }
        const raw = await callExtensionTool("netsuite_suitelet_hover", { selector, x, y });
        const data = parseToolJson(raw);
        const result = toolResult(isRecord(data) ? data : { value: data }, "Suitelet hovered.");
        const image = raw.content?.find((item) => item.type === "image" && item.data);
        if (image?.data) {
            result.content.push({ type: "image", data: image.data, mimeType: image.mimeType || "image/jpeg" });
        }
        return result;
    });
    server.registerTool("magic_netsuite_suitelet_scroll", {
        title: "Scroll Suitelet",
        description: "Scroll the controlled Suitelet (window or a scrollable element by selector) and return a screenshot of the new view. Use to reveal a results table below the fold. Omit args to page down; or pass to:\"bottom\"/\"top\", a dy delta, or a selector.",
        inputSchema: {
            selector: z.string().optional(),
            to: z.string().optional(),
            dy: z.number().optional(),
            dx: z.number().optional(),
        },
    }, async ({ selector, to, dy, dx }) => {
        if (USE_PLAYWRIGHT) {
            return controlToolResult(await playwrightController.scroll({ selector, to, dy, dx }), "Suitelet scrolled.");
        }
        const raw = await callExtensionTool("netsuite_suitelet_scroll", { selector, to, dy, dx });
        const data = parseToolJson(raw);
        const result = toolResult(isRecord(data) ? data : { value: data }, "Suitelet scrolled.");
        const image = raw.content?.find((item) => item.type === "image" && item.data);
        if (image?.data) {
            result.content.push({ type: "image", data: image.data, mimeType: image.mimeType || "image/jpeg" });
        }
        return result;
    });
    server.registerTool("magic_netsuite_suitelet_fill", {
        title: "Fill Suitelet Field",
        description: "Set the value of an input/textarea/select in the controlled Suitelet by CSS selector (fires input/change events).",
        inputSchema: {
            selector: z.string(),
            value: z.string().optional(),
        },
    }, async ({ selector, value = "" }) => {
        if (USE_PLAYWRIGHT) {
            return controlToolResult(await playwrightController.fill({ selector, value }), "Suitelet field filled.");
        }
        const data = parseToolJson(await callExtensionTool("netsuite_suitelet_fill", { selector, value }));
        return toolResult(isRecord(data) ? data : { value: data }, "Suitelet field filled.");
    });
    server.registerTool("magic_netsuite_suitelet_select", {
        title: "Select Suitelet Dropdown Option",
        description: "Choose an option in a dropdown of the controlled Suitelet. Works for BOTH native <select> and NetSuite's custom (NLAPI) dropdowns — do NOT try to click-open NetSuite dropdowns, they are not real <select>s. Pass the field by `selector` (e.g. \"#inpt_custpage_f_scripttype_1\") or `fieldId` (e.g. \"custpage_f_scripttype\"), and the choice by `value` or `label` (visible text, partial match ok). Call with NO value/label to just list the available options.",
        inputSchema: {
            selector: z.string().optional(),
            fieldId: z.string().optional(),
            value: z.string().optional(),
            label: z.string().optional(),
        },
    }, async ({ selector, fieldId, value, label }) => {
        if (USE_PLAYWRIGHT) {
            return controlToolResult(await playwrightController.select({ selector, fieldId, value, label }), "Suitelet option selected.");
        }
        const expr = JSON.stringify({ selector, fieldId, value, label });
        const data = parseToolJson(await callExtensionTool("netsuite_suitelet_eval", {
            expression: `(function(o){var f=o.fieldId;if(!f&&o.selector){var m=o.selector.match(/inpt_(.+?)_\\d+$/);if(m)f=m[1];}var fld=nlapiGetField(f);var raw=fld.getSelectOptions();var opts=[];for(var i=0;i<raw.length;i++){var v=raw[i].getId(),t=raw[i].getText();if(v!=='')opts.push({value:v,text:t});}var pick=null;if(o.value)pick=opts.filter(function(x){return x.value===o.value;})[0];if(!pick&&o.label)pick=opts.filter(function(x){return x.text.indexOf(o.label)>=0;})[0];if(pick)nlapiSetFieldValue(f,pick.value);return{ok:!!pick,chosen:pick,options:opts.map(function(x){return x.text;})};})(${expr})`,
        }));
        return toolResult(isRecord(data) ? data : { value: data }, "Suitelet option selected.");
    });
    server.registerTool("magic_netsuite_suitelet_click", {
        title: "Click Suitelet Element",
        description: "Click an element in the controlled Suitelet by CSS selector or by visible button/link text (e.g. \"Run Query\").",
        inputSchema: {
            selector: z.string().optional(),
            text: z.string().optional(),
        },
    }, async ({ selector, text }) => {
        if (USE_PLAYWRIGHT) {
            return controlToolResult(await playwrightController.click({ selector, text }), "Suitelet element clicked.");
        }
        const data = parseToolJson(await callExtensionTool("netsuite_suitelet_click", { selector, text }));
        return toolResult(isRecord(data) ? data : { value: data }, "Suitelet element clicked.");
    });
    server.registerTool("magic_netsuite_suitelet_read", {
        title: "Read Suitelet Content",
        description: "Read text/value from the controlled Suitelet by CSS selector, or the whole page body when no selector is given.",
        inputSchema: {
            selector: z.string().optional(),
            maxLength: z.number().optional(),
        },
    }, async ({ selector, maxLength }) => {
        if (USE_PLAYWRIGHT) {
            return controlToolResult(await playwrightController.read({ selector, maxLength }), "Suitelet content read.");
        }
        const data = parseToolJson(await callExtensionTool("netsuite_suitelet_read", { selector, maxLength }));
        return toolResult(isRecord(data) ? data : { value: data }, "Suitelet content read.");
    });
    server.registerTool("magic_netsuite_suitelet_eval", {
        title: "Eval in Suitelet",
        description: "Run a JavaScript expression/snippet in the controlled Suitelet tab and return the result. Flexible control primitive; prefer fill/click/read for common actions.",
        inputSchema: {
            expression: z.string(),
        },
    }, async ({ expression }) => {
        if (USE_PLAYWRIGHT) {
            return controlToolResult(await playwrightController.eval(expression), "Suitelet eval complete.");
        }
        const data = parseToolJson(await callExtensionTool("netsuite_suitelet_eval", { expression }));
        return toolResult(isRecord(data) ? data : { value: data }, "Suitelet eval complete.");
    });
    server.registerTool("magic_netsuite_save_selected_context", {
        title: "Save Selected NetSuite Context",
        description: "Save the context selected in the interactive picker so Claude can retrieve it with magic_netsuite_get_selected_context.",
        inputSchema: {
            markdown: z.string(),
            selectedItems: z.array(z.object({
                kind: z.string(),
                id: z.string(),
                recordType: z.string().optional(),
                name: z.string(),
            })),
        },
    }, async ({ markdown, selectedItems }) => {
        selectedContext = {
            markdown,
            selectedItems,
            savedAt: new Date().toISOString(),
        };
        return toolResult({
            saved: true,
            savedAt: selectedContext.savedAt,
            itemCount: selectedItems.length,
            selectedItems,
        }, `Saved ${selectedItems.length} selected NetSuite context item${selectedItems.length === 1 ? "" : "s"}.`);
    });
    server.registerTool("magic_netsuite_get_selected_context", {
        title: "Get Selected NetSuite Context",
        description: "Retrieve the latest NetSuite records/files selected in the interactive picker. Use this when the user asks about a file or record they selected in the picker.",
        inputSchema: {},
    }, async () => {
        if (!selectedContext) {
            return toolResult({
                found: false,
                markdown: "",
                selectedItems: [],
            }, "No NetSuite context has been selected in the picker yet.");
        }
        return toolResult({
            found: true,
            markdown: selectedContext.markdown,
            selectedItems: selectedContext.selectedItems,
            savedAt: selectedContext.savedAt,
        }, selectedContext.markdown);
    });
    server.registerTool("magic_netsuite_list_record_types", {
        title: "List NetSuite Record Types",
        description: "List NetSuite record types for the context picker.",
        inputSchema: {},
    }, async () => {
        const data = parseToolJson(await callExtensionTool("netsuite_list_record_types"));
        const recordTypes = rowsFrom(data)
            .map((row) => ({
            id: String(row.id ?? row.scriptId ?? "").toLowerCase(),
            name: String(row.name ?? row.label ?? row.id ?? ""),
        }))
            .filter((row) => row.id && row.name)
            .sort((a, b) => a.name.localeCompare(b.name));
        if (!recordTypes.some((row) => row.id === "script")) {
            recordTypes.unshift({ id: "script", name: "Script" });
        }
        return toolResult({ recordTypes }, `Found ${recordTypes.length} record types.`);
    });
    server.registerTool("magic_netsuite_search_records", {
        title: "Search NetSuite Records",
        description: "Search records by type and optional ID/name text.",
        inputSchema: {
            recordType: z.string(),
            query: z.string().optional(),
            limit: z.number().int().min(1).max(100).optional(),
        },
    }, async ({ recordType, query = "", limit = 50 }) => {
        let lastError = "";
        for (const sql of recordSearchQueries(recordType, query, limit)) {
            try {
                const rows = await runSuiteQLRows(sql);
                if (rows.length || sql.includes("SELECT id FROM")) {
                    return toolResult({
                        records: rows.map((row) => ({
                            id: String(row.id ?? row.ID ?? ""),
                            label: toLabel(row),
                            meta: Object.entries(row)
                                .filter(([key, value]) => key.toLowerCase() !== "id" && value !== null && value !== undefined && value !== "")
                                .slice(0, 4)
                                .map(([key, value]) => `${key}: ${String(value)}`)
                                .join(" | "),
                            raw: row,
                        })).filter((row) => row.id),
                    }, `Searched ${recordType}.`);
                }
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
            }
        }
        throw new Error(lastError || `No records found for ${recordType}.`);
    });
    server.registerTool("magic_netsuite_load_record_context", {
        title: "Load NetSuite Record Context",
        description: "Load a NetSuite record as text context for Claude.",
        inputSchema: {
            recordType: z.string(),
            recordId: z.string(),
            includeSublists: z.boolean().optional(),
        },
    }, async ({ recordType, recordId, includeSublists = false }) => {
        const body = parseToolJson(await callExtensionTool("netsuite_load_record", { recordType, recordId }));
        let sublists = undefined;
        if (includeSublists) {
            sublists = parseToolJson(await callExtensionTool("netsuite_get_record_sublists", { recordType, recordId }));
        }
        const markdown = [
            "# NetSuite Record Context",
            `recordType: ${recordType}`,
            `recordId: ${recordId}`,
            "",
            "```json",
            summarizeJson(includeSublists ? { body, sublists } : body),
            "```",
        ].join("\n");
        return markdownToolResult({ markdown, body, sublists }, `Loaded ${recordType} #${recordId}.`);
    });
    server.registerTool("magic_netsuite_list_file_cabinet_folder", {
        title: "List NetSuite File Cabinet Folder",
        description: "List File Cabinet folders and files for the context picker. Pass no folderId for root folders.",
        inputSchema: {
            folderId: z.number().nullable().optional(),
        },
    }, async ({ folderId = null }) => {
        const numericFolderId = folderId === null ? null : Number(folderId);
        if (numericFolderId === null) {
            const folders = (await runSuiteQLRows(`
        SELECT id, name, parent, foldertype, numFolderFiles, folderSize, lastModifiedDate, description
        FROM MediaItemFolder
        WHERE parent IS NULL
        ORDER BY name
      `)).map(mapFolderRow);
            return toolResult({
                folderId: null,
                folderInfo: null,
                breadcrumbs: [],
                folders,
                files: [],
            }, "Root File Cabinet folders loaded.");
        }
        const [folderInfo, folders, files, breadcrumbs] = await Promise.all([
            fetchFolderInfo(numericFolderId),
            runSuiteQLRows(`
        SELECT id, name, parent, foldertype, numFolderFiles, folderSize, lastModifiedDate, description
        FROM MediaItemFolder
        WHERE parent = ${numericFolderId}
        ORDER BY name
      `).then((rows) => rows.map(mapFolderRow)),
            runSuiteQLRows(`
        SELECT id, name, fileType, fileSize, folder, lastModifiedDate, createdDate, description, url
        FROM File
        WHERE folder = ${numericFolderId}
        ORDER BY name
      `).then((rows) => rows.map(mapFileRow)),
            buildFolderBreadcrumbs(numericFolderId),
        ]);
        return toolResult({
            folderId: numericFolderId,
            folderInfo,
            breadcrumbs,
            folders,
            files,
        }, "File Cabinet folder loaded.");
    });
    server.registerTool("magic_netsuite_search_files", {
        title: "Search NetSuite File Cabinet",
        description: "Search the NetSuite File Cabinet by file/folder ID or name.",
        inputSchema: {
            query: z.string(),
            limit: z.number().int().min(1).max(100).optional(),
        },
    }, async ({ query, limit = 50 }) => {
        const cleanQuery = query.trim();
        const escaped = cleanQuery.replace(/'/g, "''");
        const numeric = isNumeric(cleanQuery);
        const rowLimit = Math.max(1, Math.min(100, limit));
        const folderSql = numeric
            ? `
        SELECT id, name, parent, foldertype, numFolderFiles, folderSize, lastModifiedDate, description
        FROM MediaItemFolder
        WHERE id = ${Number(cleanQuery)}
        ORDER BY name
      `
            : `
        SELECT id, name, parent, foldertype, numFolderFiles, folderSize, lastModifiedDate, description
        FROM MediaItemFolder
        WHERE LOWER(name) LIKE LOWER('%${escaped}%')
          AND ROWNUM <= ${rowLimit}
        ORDER BY name
      `;
        const [folderRows, fileData] = await Promise.all([
            runSuiteQLRows(folderSql),
            callExtensionTool("netsuite_find_file", numeric ? { id: cleanQuery } : { name: cleanQuery }).then(parseToolJson),
        ]);
        const folders = folderRows.slice(0, rowLimit).map(mapFolderRow);
        const files = rowsFrom(fileData)
            .slice(0, rowLimit)
            .map((row) => ({
            id: Number(row.id ?? row.ID),
            name: String(row.name ?? row.Name ?? row.id ?? ""),
            folder: row.folder ?? null,
            filesize: Number(row.filesize ?? row.fileSize ?? 0),
            filetype: String(row.filetype ?? row.fileType ?? ""),
            url: row.url ? String(row.url) : undefined,
        }))
            .filter((file) => Number.isFinite(file.id) && file.name);
        return toolResult({ folders, files, breadcrumbs: [], folderId: null }, `Found ${folders.length} folders and ${files.length} files.`);
    });
    server.registerTool("magic_netsuite_read_file_context", {
        title: "Read NetSuite File Context",
        description: "Read a NetSuite File Cabinet file as text context for Claude.",
        inputSchema: {
            fileId: z.string(),
        },
    }, async ({ fileId }) => {
        const file = parseToolJson(await callExtensionTool("netsuite_read_file", { fileId }));
        const markdown = [
            "# NetSuite File Cabinet Context",
            `fileId: ${fileId}`,
            "",
            "```json",
            summarizeJson(file),
            "```",
        ].join("\n");
        return markdownToolResult({ markdown, file }, `Loaded file #${fileId}.`);
    });
    registerAppResource(server, resourceUri, resourceUri, { mimeType: RESOURCE_MIME_TYPE }, async () => {
        const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf8");
        return {
            contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
        };
    });
    return server;
}
