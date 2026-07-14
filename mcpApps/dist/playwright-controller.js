import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
// Dedicated, on-disk Chromium profile so the NetSuite login survives across
// sessions. Independent of the user's daily browser (Chrome/Brave/etc.) — we
// drive Playwright's own bundled Chromium, no debug flags, no profile sharing.
const PROFILE_DIR = process.env.MAGIC_NS_PW_PROFILE ||
    path.join(os.homedir(), ".magic-netsuite", "pw-profile");
// NetSuite's auth cookies are session-scoped (no expiry), so a persistent
// profile alone drops them when the context closes / the node process is
// killed (e.g. on Claude restart). We additionally snapshot storageState
// (which captures session cookies) and re-inject it on launch.
const STATE_FILE = path.join(path.dirname(PROFILE_DIR), "magic-ns-storage-state.json");
const TEMPLATE_REVIEW_STATE_FILE = process.env.MAGIC_NS_TEMPLATE_REVIEW_STATE ||
    path.join(path.dirname(PROFILE_DIR), "template-review-state.json");
const NAV_TIMEOUT = 45000;
// Extension logo, used as the Playwright tab favicon. Read from disk at startup
// (dev runs from mcp_app/, built runs from mcp_app/dist/), so try both depths.
const BRAND_TITLE_PREFIX = "Magic Netsuite Testing";
const FAVICON_DATA_URI = (() => {
    const candidates = [
        path.join(import.meta.dirname, "..", "..", "src", "icons", "icon32.png"),
        path.join(import.meta.dirname, "..", "src", "icons", "icon32.png"),
    ];
    for (const file of candidates) {
        try {
            const b64 = fs.readFileSync(file).toString("base64");
            return `data:image/png;base64,${b64}`;
        }
        catch {
            /* try next */
        }
    }
    return "";
})();
let context = null;
let page = null;
let templateReviewPage = null;
let launching = null;
let templateReviewState = null;
let templateReviewBindingReady = false;
const templateReviewWaiters = new Set();
let templateReviewRecoveryTimer = null;
let templateReviewRecoveryInFlight = false;
let templateRecordOptionsResolver = null;
function dismissTemplateReviewSurface() {
    if (templateReviewRecoveryTimer) {
        clearTimeout(templateReviewRecoveryTimer);
        templateReviewRecoveryTimer = null;
    }
    if (isPendingTemplateReview(templateReviewState || loadPersistedTemplateReviewState())) {
        applyTemplateReviewUpdate({ status: "done", feedback: "" });
    }
}
async function launch() {
    const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false, // actions must be visible (user requirement)
        viewport: null, // null + --start-maximized => real maximized window
        args: ["--start-maximized"],
    });
    context = ctx;
    ctx.on("close", () => {
        context = null;
        page = null;
        templateReviewPage = null;
        templateReviewBindingReady = false;
        scheduleTemplateReviewRecovery();
    });
    // Re-inject previously saved session cookies (lost from the profile on close).
    try {
        if (fs.existsSync(STATE_FILE)) {
            const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
            if (Array.isArray(state?.cookies) && state.cookies.length) {
                await ctx.addCookies(state.cookies);
            }
        }
    }
    catch {
        /* corrupt/absent state — user just logs in again */
    }
    const p = ctx.pages()[0] ?? (await ctx.newPage());
    p.on("close", () => {
        if (page === p)
            page = null;
    });
    page = p;
    return p;
}
// Persist cookies (incl. session cookies) so login survives restarts.
async function saveState() {
    if (!context)
        return;
    try {
        await context.storageState({ path: STATE_FILE });
    }
    catch {
        /* best effort */
    }
}
async function ensurePage() {
    if (page && !page.isClosed())
        return page;
    // Page died (e.g. a bad eval closed the tab) but the context is still alive:
    // open a fresh page in the SAME context. Relaunching would try to re-lock the
    // profile dir and collide with the existing Chromium window.
    if (context) {
        try {
            const np = (context.pages().find((pg) => !pg.isClosed())) ?? (await context.newPage());
            np.on("close", () => {
                if (page === np)
                    page = null;
            });
            page = np;
            return np;
        }
        catch {
            context = null; // context truly dead — fall through to relaunch
        }
    }
    if (launching)
        return launching;
    launching = launch().finally(() => {
        launching = null;
    });
    return launching;
}
async function ensureTemplateReviewPage() {
    if (templateReviewPage && !templateReviewPage.isClosed())
        return templateReviewPage;
    await ensurePage();
    if (!context)
        throw new Error("Playwright browser context is unavailable.");
    const p = await context.newPage();
    templateReviewPage = p;
    templateReviewBindingReady = false;
    let crashed = false;
    p.on("crash", () => {
        crashed = true;
        if (templateReviewPage === p)
            templateReviewPage = null;
        templateReviewBindingReady = false;
        scheduleTemplateReviewRecovery(250);
    });
    p.on("framenavigated", (frame) => {
        if (frame === p.mainFrame() && isPendingTemplateReview(templateReviewState || loadPersistedTemplateReviewState())) {
            scheduleTemplateReviewRecovery(150);
        }
    });
    p.on("domcontentloaded", () => {
        if (isPendingTemplateReview(templateReviewState || loadPersistedTemplateReviewState())) {
            scheduleTemplateReviewRecovery(100);
        }
    });
    p.on("close", () => {
        if (templateReviewPage === p)
            templateReviewPage = null;
        templateReviewBindingReady = false;
        if (crashed)
            scheduleTemplateReviewRecovery(250);
        else
            dismissTemplateReviewSurface();
    });
    return p;
}
// NetSuite bounces unauthenticated requests to a login form. Detect it so the
// caller can tell the user to log in once in the visible window.
async function detectLogin(p) {
    const url = p.url();
    if (/system\.netsuite\.com|\/login|\/pages\/login|account-login/i.test(url)) {
        return true;
    }
    try {
        const hasLoginField = await p
            .locator('input[name="email"], input[type="password"], #login-email, #login-password')
            .first()
            .isVisible({ timeout: 800 });
        if (hasLoginField)
            return true;
    }
    catch {
        /* no login field visible */
    }
    return false;
}
const INSPECT_FN = () => {
    const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const selectorFor = (el) => {
        if (el.id)
            return "#" + CSS.escape(el.id);
        const name = el.getAttribute("name");
        if (name)
            return el.tagName.toLowerCase() + '[name="' + name + '"]';
        const dataInput = el.getAttribute("data-input-id");
        if (dataInput)
            return el.tagName.toLowerCase() + '[data-input-id="' + dataInput + '"]';
        const path = [];
        let node = el;
        while (node && node.nodeType === 1 && path.length < 5) {
            let part = node.tagName.toLowerCase();
            const parent = node.parentElement;
            if (parent) {
                const idx = Array.prototype.indexOf.call(parent.children, node) + 1;
                part += ":nth-child(" + idx + ")";
            }
            path.unshift(part);
            if (node.id) {
                path[0] = "#" + CSS.escape(node.id);
                break;
            }
            node = node.parentElement;
        }
        return path.join(" > ");
    };
    const nodes = Array.prototype.slice.call(document.querySelectorAll("input, textarea, select, button, a[href], [role=button], [onclick], .ddarrowSpan, .uir-field-dropdown-arrow, [data-input-id], .uir-field-wrapper[data-nsps-label]"));
    const out = [];
    for (let i = 0; i < nodes.length && out.length < 120; i++) {
        const el = nodes[i];
        if (!visible(el))
            continue;
        const labelledById = el.getAttribute("aria-labelledby");
        const labelledBy = labelledById ? document.getElementById(labelledById) : null;
        const fieldWrapper = el.closest ? el.closest(".uir-field-wrapper[data-nsps-label]") : null;
        out.push({
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute("type") || "",
            id: el.id || "",
            name: el.getAttribute("name") || "",
            selector: selectorFor(el),
            label: (el.innerText ||
                el.value ||
                el.placeholder ||
                el.getAttribute("aria-label") ||
                (labelledBy && labelledBy.innerText) ||
                el.getAttribute("title") ||
                el.getAttribute("data-nsps-label") ||
                (fieldWrapper && fieldWrapper.getAttribute("data-nsps-label")) ||
                "")
                .trim()
                .slice(0, 100),
        });
    }
    return { title: document.title, url: location.href, count: out.length, elements: out };
};
async function screenshotB64(p) {
    const buf = await p.screenshot({ type: "jpeg", quality: 60 });
    return buf.toString("base64");
}
async function templateArtifactScreenshots(p) {
    if (await p.locator("#pdfFrame").first().isVisible().catch(() => false)) {
        await p.waitForTimeout(800);
    }
    const capture = async (selector) => {
        try {
            const locator = p.locator(selector).first();
            if (!(await locator.isVisible({ timeout: 1200 })))
                return undefined;
            const buffer = await locator.screenshot({ type: "jpeg", quality: 82 });
            return buffer.toString("base64");
        }
        catch {
            return undefined;
        }
    };
    return {
        htmlScreenshot: await capture("#htmlFrame"),
        pdfScreenshot: await capture("#pdfFrame"),
    };
}
// Wait for the page to actually finish loading after an action before we
// screenshot: full load + network idle + NetSuite's own loading indicators
// gone, plus a small settle for late client-side rendering.
async function settlePage(p) {
    await p.waitForLoadState("load", { timeout: 15000 }).catch(() => { });
    await p.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => { });
    // NetSuite spinners / loading masks across UI generations.
    await p
        .locator("#loadingindicator, #div__alt_l> img, .uir-page-loading-indicator, .bg_loading, .ns-loading-indicator")
        .first()
        .waitFor({ state: "hidden", timeout: 8000 })
        .catch(() => { });
    await p.waitForTimeout(350);
}
// Rebrand the tab: set the title to "Magic Netsuite Testing <suitelet>" and the
// favicon to the extension logo, and keep re-applying them (NetSuite's own JS
// resets document.title and the favicon as the page boots).
async function brandTab(p, title, favicon) {
    try {
        await p.evaluate(({ title, favicon }) => {
            // IDEMPOTENT: only touch the DOM when something is actually wrong, so
            // re-applying is cheap and never causes DOM churn. NO MutationObserver —
            // observing the whole document while mutating <head> self-triggers an
            // infinite loop that freezes/crashes the tab on DOM-heavy pages.
            const apply = () => {
                if (title && document.title !== title)
                    document.title = title;
                if (favicon && document.head) {
                    const existing = document.head.querySelector('link[rel="icon"]');
                    if (existing && existing.href === favicon)
                        return; // already ours — do nothing
                    // Remove other icon links (rel is case-insensitive, e.g. "SHORTCUT ICON").
                    Array.from(document.querySelectorAll("link")).forEach((el) => {
                        if ((el.getAttribute("rel") || "").toLowerCase().includes("icon")) {
                            el.parentNode?.removeChild(el);
                        }
                    });
                    const link = document.createElement("link");
                    link.rel = "icon";
                    link.type = "image/png";
                    link.href = favicon;
                    document.head.appendChild(link);
                }
            };
            apply();
            // NetSuite sets its own title/favicon a beat after load — re-apply on a
            // few bounded, timed ticks (cheap because apply() is idempotent), then stop.
            const w = window;
            if (!w.__magicNsBrandTimer) {
                let ticks = 0;
                w.__magicNsBrandTimer = window.setInterval(() => {
                    apply();
                    if (++ticks >= 8) {
                        window.clearInterval(w.__magicNsBrandTimer);
                        w.__magicNsBrandTimer = undefined;
                    }
                }, 1000);
            }
        }, { title, favicon });
    }
    catch {
        /* page navigated mid-brand — best effort */
    }
}
function makeReviewId() {
    return `review_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function defaultTemplateReviewComments() {
    return [];
}
function withoutUndefined(value) {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
function stringArray(value, fallback = []) {
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : fallback;
}
function makeEmptyTemplateReviewState() {
    return {
        reviewId: makeReviewId(),
        title: "NetSuite Template Review",
        templateFile: "invoice_template.ftl",
        recordType: "invoice",
        recordId: "",
        recordTypeOptions: ["invoice"],
        recordIdOptions: [],
        recordTypeLabels: { invoice: "Invoice" },
        recordIdLabels: {},
        html: "",
        freemarker: "",
        pdfDataUrl: "",
        renderError: "",
        sessionId: "",
        referenceImageDataUrl: "",
        referenceImageUrl: "",
        feedback: "",
        comments: defaultTemplateReviewComments(),
        status: "html_review",
        version: 0,
        updatedAt: new Date().toISOString(),
    };
}
function normalizeTemplateReviewState(value) {
    if (!value || typeof value !== "object")
        return null;
    const input = value;
    const migratedStatus = {
        open: "html_review",
        needs_changes: "html_changes_requested",
        approved: "html_approved",
        ftl_review: "freemarker_review",
        ftl_approved: "freemarker_approved",
    };
    const rawStatus = typeof input.status === "string" ? input.status : "";
    const allowedStatuses = new Set([
        "html_review", "html_changes_requested", "html_approved", "converting",
        "freemarker_review", "freemarker_changes_requested", "freemarker_approved",
        "render_error", "done",
    ]);
    const status = allowedStatuses.has(rawStatus)
        ? rawStatus
        : migratedStatus[rawStatus] || "html_review";
    return {
        ...makeEmptyTemplateReviewState(),
        reviewId: typeof input.reviewId === "string" && input.reviewId ? input.reviewId : makeReviewId(),
        title: typeof input.title === "string" && input.title ? input.title : "NetSuite Template Review",
        templateFile: typeof input.templateFile === "string" && input.templateFile ? input.templateFile : "invoice_template.ftl",
        recordType: typeof input.recordType === "string" && input.recordType ? input.recordType : "invoice",
        recordId: typeof input.recordId === "string" ? input.recordId : "",
        recordTypeOptions: stringArray(input.recordTypeOptions, ["invoice"]),
        recordIdOptions: stringArray(input.recordIdOptions),
        recordTypeLabels: input.recordTypeLabels && typeof input.recordTypeLabels === "object" ? input.recordTypeLabels : {},
        recordIdLabels: input.recordIdLabels && typeof input.recordIdLabels === "object" ? input.recordIdLabels : {},
        html: typeof input.html === "string" ? input.html : "",
        freemarker: typeof input.freemarker === "string" ? input.freemarker : "",
        pdfDataUrl: typeof input.pdfDataUrl === "string" ? input.pdfDataUrl : "",
        renderError: typeof input.renderError === "string" ? input.renderError : "",
        sessionId: typeof input.sessionId === "string" ? input.sessionId : "",
        referenceImageDataUrl: typeof input.referenceImageDataUrl === "string" ? input.referenceImageDataUrl : "",
        referenceImageUrl: typeof input.referenceImageUrl === "string" ? input.referenceImageUrl : "",
        feedback: typeof input.feedback === "string" ? input.feedback : "",
        comments: Array.isArray(input.comments) ? input.comments : [],
        status,
        version: typeof input.version === "number" ? input.version : 0,
        updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : new Date().toISOString(),
    };
}
function loadPersistedTemplateReviewState() {
    for (const file of [TEMPLATE_REVIEW_STATE_FILE, `${TEMPLATE_REVIEW_STATE_FILE}.bak`]) {
        try {
            const state = normalizeTemplateReviewState(JSON.parse(fs.readFileSync(file, "utf8")));
            if (state)
                return state;
        }
        catch {
            /* try the journal backup */
        }
    }
    return null;
}
function currentReviewSnapshot() {
    if (!templateReviewState)
        templateReviewState = loadPersistedTemplateReviewState();
    if (!templateReviewState)
        throw new Error("No template review is open.");
    return { ...templateReviewState };
}
function resolveTemplateReview(state) {
    for (const resolve of templateReviewWaiters)
        resolve({ ...state });
    templateReviewWaiters.clear();
}
function persistTemplateReviewState(state) {
    try {
        fs.mkdirSync(path.dirname(TEMPLATE_REVIEW_STATE_FILE), { recursive: true });
        const serialized = JSON.stringify({
            reviewId: state.reviewId,
            title: state.title,
            templateFile: state.templateFile,
            recordType: state.recordType,
            recordId: state.recordId,
            recordTypeOptions: state.recordTypeOptions,
            recordIdOptions: state.recordIdOptions,
            recordTypeLabels: state.recordTypeLabels,
            recordIdLabels: state.recordIdLabels,
            html: state.html,
            freemarker: state.freemarker,
            pdfDataUrl: state.pdfDataUrl,
            renderError: state.renderError,
            sessionId: state.sessionId,
            referenceImageDataUrl: state.referenceImageDataUrl,
            referenceImageUrl: state.referenceImageUrl,
            status: state.status,
            feedback: state.feedback,
            comments: state.comments,
            version: state.version,
            updatedAt: state.updatedAt,
            pending: state.status === "html_review" ||
                state.status === "html_changes_requested" ||
                state.status === "freemarker_review" ||
                state.status === "freemarker_changes_requested" ||
                state.status === "render_error",
        }, null, 2);
        const nextFile = `${TEMPLATE_REVIEW_STATE_FILE}.next`;
        const backupFile = `${TEMPLATE_REVIEW_STATE_FILE}.bak`;
        fs.writeFileSync(nextFile, serialized, "utf8");
        fs.rmSync(backupFile, { force: true });
        if (fs.existsSync(TEMPLATE_REVIEW_STATE_FILE))
            fs.renameSync(TEMPLATE_REVIEW_STATE_FILE, backupFile);
        fs.renameSync(nextFile, TEMPLATE_REVIEW_STATE_FILE);
    }
    catch {
        /* The previous main/backup remains recoverable if a write is interrupted. */
    }
}
function isPendingTemplateReview(state) {
    return Boolean(state && state.status !== "done" && state.status !== "freemarker_approved");
}
async function pushTemplateReviewState(p, state) {
    return p.evaluate((next) => {
        const w = window;
        if (!document.querySelector(".review-app") || !w.__magicTemplateReviewSet)
            return false;
        w.__magicTemplateReviewSet(next);
        return true;
    }, state).catch(() => false);
}
async function rehydrateTemplateReviewSurface() {
    const state = templateReviewState || loadPersistedTemplateReviewState();
    if (!isPendingTemplateReview(state))
        return null;
    templateReviewState = state;
    const p = await ensureTemplateReviewPage();
    await ensureTemplateReviewBinding(p);
    if (!(await pushTemplateReviewState(p, state))) {
        await p.setContent(buildTemplateReviewHtml(state), { waitUntil: "load", timeout: NAV_TIMEOUT });
        await settlePage(p);
        await brandTab(p, `${BRAND_TITLE_PREFIX} ${state.title}`.trim(), FAVICON_DATA_URI);
    }
    return p;
}
function scheduleTemplateReviewRecovery(delayMs = 400) {
    if (templateReviewRecoveryTimer || templateReviewRecoveryInFlight)
        return;
    const state = templateReviewState || loadPersistedTemplateReviewState();
    if (!isPendingTemplateReview(state))
        return;
    templateReviewRecoveryTimer = setTimeout(async () => {
        templateReviewRecoveryTimer = null;
        templateReviewRecoveryInFlight = true;
        try {
            await rehydrateTemplateReviewSurface();
        }
        catch {
            setTimeout(() => scheduleTemplateReviewRecovery(2000), 2000);
        }
        finally {
            templateReviewRecoveryInFlight = false;
        }
    }, delayMs);
}
function applyTemplateReviewUpdate(patch) {
    if (!templateReviewState) {
        templateReviewState = loadPersistedTemplateReviewState() || makeEmptyTemplateReviewState();
    }
    const cleanPatch = withoutUndefined(patch);
    templateReviewState = {
        ...templateReviewState,
        ...cleanPatch,
        version: templateReviewState.version + 1,
        updatedAt: new Date().toISOString(),
    };
    persistTemplateReviewState(templateReviewState);
    if (templateReviewState.status === "html_approved" ||
        templateReviewState.status === "freemarker_approved" ||
        templateReviewState.status === "html_changes_requested" ||
        templateReviewState.status === "freemarker_changes_requested" ||
        templateReviewState.status === "done") {
        resolveTemplateReview(templateReviewState);
    }
    return { ...templateReviewState };
}
async function ensureTemplateReviewBinding(p) {
    if (templateReviewBindingReady)
        return;
    try {
        await p.exposeBinding("__magicTemplateReviewAction", async (_source, payload) => {
            if (payload.action === "end_review") {
                const state = applyTemplateReviewUpdate({ status: "done", feedback: "" });
                setTimeout(() => p.close().catch(() => { }), 0);
                return { ok: true, version: state.version };
            }
            if (payload.action === "reference_updated") {
                const referenceImageDataUrl = String(payload.referenceImageDataUrl || "");
                if (referenceImageDataUrl.startsWith("data:image/")) {
                    applyTemplateReviewUpdate({ referenceImageDataUrl, referenceImageUrl: "" });
                }
                return { ok: true };
            }
            if (payload.action === "record_options_requested") {
                const recordType = String(payload.recordType || templateReviewState?.recordType || "invoice");
                if (!templateRecordOptionsResolver)
                    return { ok: false, message: "NetSuite record lookup is unavailable." };
                const options = await templateRecordOptionsResolver(recordType);
                const state = applyTemplateReviewUpdate({
                    recordType,
                    recordId: "",
                    recordTypeOptions: options.recordTypeOptions,
                    recordIdOptions: options.recordIdOptions,
                    recordTypeLabels: options.recordTypeLabels,
                    recordIdLabels: options.recordIdLabels,
                });
                await pushTemplateReviewState(p, state);
                return { ok: true, ...options };
            }
            if (payload.action === "context_updated") {
                const state = applyTemplateReviewUpdate({
                    recordType: String(payload.recordType ?? templateReviewState?.recordType ?? "invoice"),
                    recordId: String(payload.recordId ?? templateReviewState?.recordId ?? ""),
                });
                return { ok: true, version: state.version };
            }
            const requestedStatus = String(payload.status || "");
            const allowedActions = new Set([
                "html_approved", "html_changes_requested", "freemarker_approved",
                "freemarker_changes_requested", "done",
            ]);
            const status = allowedActions.has(requestedStatus)
                ? requestedStatus
                : "html_changes_requested";
            const state = applyTemplateReviewUpdate({
                status,
                feedback: String(payload.feedback ?? ""),
                comments: Array.isArray(payload.comments)
                    ? payload.comments
                    : templateReviewState?.comments,
                recordType: String(payload.recordType ?? templateReviewState?.recordType ?? ""),
                recordId: String(payload.recordId ?? templateReviewState?.recordId ?? ""),
            });
            return { ok: true, version: state.version };
        });
        templateReviewBindingReady = true;
    }
    catch {
        templateReviewBindingReady = true;
    }
}
function buildTemplateReviewHtml(state) {
    const data = JSON.stringify(state).replace(/</g, "\\u003c");
    const candidates = [
        path.join(import.meta.dirname, "dist", "template-review.html"),
        path.join(import.meta.dirname, "template-review.html"),
        path.join(import.meta.dirname, "..", "dist", "template-review.html"),
    ];
    for (const file of candidates) {
        try {
            const html = fs.readFileSync(file, "utf8");
            const boot = `<script>window.__MAGIC_TEMPLATE_REVIEW_INITIAL__=${data};</script>`;
            return html.includes("</head>") ? html.replace("</head>", `${boot}</head>`) : `${boot}${html}`;
        }
        catch {
            /* try next */
        }
    }
    throw new Error("Template review UI asset was not found. Run the mcp_app production build before starting the server.");
}
export const playwrightController = {
    profileDir: PROFILE_DIR,
    setTemplateRecordOptionsResolver(resolver) {
        templateRecordOptionsResolver = resolver;
    },
    async previewHtml(html, label = "FreeMarker Preview") {
        if (!html.trim())
            throw new Error("HTML is required for the Playwright preview.");
        const p = await ensurePage();
        await p.setContent(html, { waitUntil: "load", timeout: NAV_TIMEOUT });
        await p.setViewportSize({ width: 1100, height: 1400 }).catch(() => { });
        await p.emulateMedia({ media: "screen" }).catch(() => { });
        await settlePage(p);
        await brandTab(p, `${BRAND_TITLE_PREFIX} ${label}`.trim(), FAVICON_DATA_URI);
        const info = await p.evaluate(() => ({
            title: document.title,
            url: location.href,
            bodyTextLength: document.body?.innerText?.length ?? 0,
            documentHeight: Math.ceil(document.documentElement.scrollHeight),
            documentWidth: Math.ceil(document.documentElement.scrollWidth),
        }));
        return { ok: true, ...info, screenshot: await screenshotB64(p) };
    },
    async openTemplateReview(opts) {
        if (!opts.html.trim())
            throw new Error("HTML is required for the template review.");
        const p = await ensureTemplateReviewPage();
        await ensureTemplateReviewBinding(p);
        const state = applyTemplateReviewUpdate({
            reviewId: makeReviewId(),
            title: opts.title || "NetSuite Template Review",
            templateFile: opts.templateFile || "invoice_template.ftl",
            recordType: opts.recordType || "invoice",
            recordId: opts.recordId || "",
            recordTypeOptions: opts.recordTypeOptions?.length ? opts.recordTypeOptions : [opts.recordType || "invoice"],
            recordIdOptions: opts.recordIdOptions?.length ? opts.recordIdOptions : (opts.recordId ? [opts.recordId] : []),
            recordTypeLabels: opts.recordTypeLabels || {},
            recordIdLabels: opts.recordIdLabels || {},
            html: opts.html,
            freemarker: opts.freemarker || "",
            pdfDataUrl: opts.pdfDataUrl || "",
            renderError: "",
            sessionId: opts.sessionId || "",
            referenceImageDataUrl: opts.referenceImageDataUrl || "",
            referenceImageUrl: opts.referenceImageUrl || "",
            feedback: "",
            comments: defaultTemplateReviewComments(),
            status: "html_review",
        });
        await p.setContent(buildTemplateReviewHtml(state), { waitUntil: "load", timeout: NAV_TIMEOUT });
        await settlePage(p);
        await brandTab(p, `${BRAND_TITLE_PREFIX} ${state.title}`.trim(), FAVICON_DATA_URI);
        const referenceLoaded = await p.locator("#referenceImage").evaluate((image) => image.complete && image.naturalWidth > 0).catch(() => false);
        return { ok: true, ...state, referenceLoaded, ...(await templateArtifactScreenshots(p)) };
    },
    async updateTemplateReview(opts) {
        const p = await ensureTemplateReviewPage();
        if (!templateReviewState || (!opts.html && !templateReviewState.html)) {
            const pageState = await p.evaluate(() => {
                const w = window;
                return w.__magicTemplateReviewGet ? w.__magicTemplateReviewGet() : null;
            }).catch(() => null);
            const recovered = normalizeTemplateReviewState(pageState) || loadPersistedTemplateReviewState();
            if (recovered)
                templateReviewState = recovered;
        }
        if (!opts.html && !templateReviewState?.html) {
            throw new Error("Template review update refused because no existing HTML preview could be recovered. Pass the revised HTML to magic_netsuite_template_review_update.");
        }
        const state = applyTemplateReviewUpdate(opts);
        await ensureTemplateReviewBinding(p);
        const pushed = await pushTemplateReviewState(p, state);
        if (!pushed) {
            await p.setContent(buildTemplateReviewHtml(state), { waitUntil: "load", timeout: NAV_TIMEOUT });
        }
        await settlePage(p);
        return { ok: true, ...state, ...(await templateArtifactScreenshots(p)) };
    },
    async waitTemplateReview(timeoutMs = 900000) {
        const existing = currentReviewSnapshot();
        if (existing.status === "html_approved" ||
            existing.status === "freemarker_approved" ||
            existing.status === "html_changes_requested" ||
            existing.status === "freemarker_changes_requested" ||
            existing.status === "done") {
            return { ok: true, ...existing };
        }
        await rehydrateTemplateReviewSurface();
        const state = await new Promise((resolve, reject) => {
            let monitoring = false;
            const cleanup = () => {
                clearTimeout(timer);
                clearInterval(monitor);
                templateReviewWaiters.delete(done);
            };
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error("Timed out waiting for template review action."));
            }, Math.max(1000, timeoutMs));
            const done = (value) => {
                cleanup();
                resolve(value);
            };
            templateReviewWaiters.add(done);
            const monitor = setInterval(async () => {
                if (monitoring)
                    return;
                monitoring = true;
                try {
                    const persisted = loadPersistedTemplateReviewState();
                    if (persisted && persisted.version > (templateReviewState?.version ?? -1))
                        templateReviewState = persisted;
                    const current = templateReviewState;
                    if (current && ["html_approved", "freemarker_approved", "html_changes_requested", "freemarker_changes_requested", "done"].includes(current.status)) {
                        done(current);
                        return;
                    }
                    await rehydrateTemplateReviewSurface();
                }
                catch {
                    scheduleTemplateReviewRecovery(1000);
                }
                finally {
                    monitoring = false;
                }
            }, 1500);
        });
        return { ok: true, ...state };
    },
    templateReviewState() {
        return { ok: true, ...currentReviewSnapshot() };
    },
    async open(url, cookies, label) {
        if (!url)
            throw new Error("A Suitelet URL is required to open in Playwright.");
        const p = await ensurePage();
        // Inject the real browser session (cookies dumped from the logged-in tab)
        // so Playwright reuses it instead of hitting the NetSuite login.
        if (cookies?.length && context) {
            await context.addCookies(cookies).catch(() => { });
        }
        await p.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
        await settlePage(p);
        const tabTitle = `${BRAND_TITLE_PREFIX}${label ? ` ${label}` : ""}`.trim();
        await brandTab(p, tabTitle, FAVICON_DATA_URI);
        if (await detectLogin(p)) {
            return {
                ok: false,
                needsLogin: true,
                url: p.url(),
                message: "NetSuite is asking you to log in. A Chromium window is open — sign in there once (incl. MFA), then re-run the open. The session is saved on disk for next time.",
                screenshot: await screenshotB64(p),
            };
        }
        // Logged in successfully — snapshot the session so it survives restarts.
        await saveState();
        const info = await p.evaluate(INSPECT_FN);
        return { ok: true, ...info, screenshot: await screenshotB64(p) };
    },
    async inspect() {
        const p = await ensurePage();
        const info = await p.evaluate(INSPECT_FN);
        return { ok: true, ...info };
    },
    async screenshot() {
        const p = await ensurePage();
        return { ok: true, url: p.url(), screenshot: await screenshotB64(p) };
    },
    async click(opts) {
        const p = await ensurePage();
        let target = null;
        if (opts.selector) {
            target = p.locator(opts.selector).first();
        }
        else if (opts.text) {
            const byRole = p.getByRole("button", { name: opts.text, exact: false });
            target = (await byRole.first().isVisible({ timeout: 500 }).catch(() => false))
                ? byRole.first()
                : p.getByText(opts.text, { exact: false }).first();
        }
        else {
            throw new Error("click requires a selector or text.");
        }
        // Click by POSITION: resolve the element by selector, then mouse.click its
        // center. A coordinate click hits whatever element is topmost at that point
        // (the one actually carrying the handler / any overlay), so it doesn't
        // depend on the selector resolving to the exact event-bearing node — and it
        // won't throw on locator.click()'s "receives events" check like NetSuite's
        // obscured widgets do. locator.click() is only the fallback.
        await target.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => { });
        let box = await target.boundingBox({ timeout: 10000 }).catch(() => null);
        if (!box) {
            // Wait for it to actually lay out, then retry once.
            await target.waitFor({ state: "visible", timeout: 10000 }).catch(() => { });
            box = await target.boundingBox({ timeout: 5000 }).catch(() => null);
        }
        if (box) {
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;
            await p.mouse.move(x, y, { steps: 20 }); // visible cursor travel
            await p.mouse.click(x, y);
        }
        else {
            await target.click({ timeout: 15000 }); // fallback: element click
        }
        await settlePage(p);
        return { ok: true, screenshot: await screenshotB64(p) };
    },
    // Robustly read/choose a dropdown option. NetSuite's custom dropdowns are NOT
    // real <select> elements (hidden field + rendered widget), so clicking them is
    // flaky. This sets the value via the right mechanism instead:
    //   - native <select>  -> set value/text + dispatch change
    //   - NetSuite field   -> nlapiSetFieldValue (resolves value from label)
    // Call with no value/label to just LIST the options.
    async select(opts) {
        const p = await ensurePage();
        const res = (await p.evaluate((o) => {
            const w = window;
            // Derive the NetSuite field id from a selector like #inpt_custpage_xxx_1.
            let fid = o.fieldId || "";
            if (!fid && o.selector) {
                const m = o.selector.match(/inpt_(.+?)_\d+$/) ||
                    o.selector.match(/(custpage_[a-z0-9_]+)/i) ||
                    o.selector.match(/name=["']?([^"'\]]+)/i);
                if (m)
                    fid = m[1];
            }
            const pickFrom = (opts) => {
                if (o.value != null) {
                    const byVal = opts.find((x) => x.value === o.value);
                    if (byVal)
                        return byVal;
                }
                if (o.label != null) {
                    const exact = opts.find((x) => x.text.trim() === o.label.trim());
                    if (exact)
                        return exact;
                    const part = opts.find((x) => x.text.toLowerCase().includes(o.label.toLowerCase()));
                    if (part)
                        return part;
                }
                return null;
            };
            // 1) Native <select>?
            const nativeEl = (fid && (document.querySelector(`select[name="${fid}"]`) || document.getElementById(fid))) || null;
            if (nativeEl && nativeEl.tagName === "SELECT") {
                const sel = nativeEl;
                const opts = Array.from(sel.options).map((op) => ({ value: op.value, text: op.text }));
                const pick = pickFrom(opts);
                if (pick) {
                    sel.value = pick.value;
                    sel.dispatchEvent(new Event("input", { bubbles: true }));
                    sel.dispatchEvent(new Event("change", { bubbles: true }));
                }
                return { ok: o.value == null && o.label == null ? true : !!pick, mode: "native", fieldId: fid, chosen: pick, options: opts.map((x) => x.text) };
            }
            // 2) NetSuite NLAPI dropdown.
            if (typeof w.nlapiGetField === "function" && fid) {
                const f = w.nlapiGetField(fid);
                const raw = f?.getSelectOptions ? f.getSelectOptions() : [];
                const opts = [];
                for (let i = 0; i < raw.length; i++) {
                    const v = raw[i].getId();
                    const t = raw[i].getText();
                    if (v !== "")
                        opts.push({ value: v, text: t });
                }
                const pick = pickFrom(opts);
                if (pick && typeof w.nlapiSetFieldValue === "function") {
                    w.nlapiSetFieldValue(fid, pick.value);
                }
                const dispEl = document.getElementById(`inpt_${fid}_1`);
                return {
                    ok: o.value == null && o.label == null ? true : !!pick,
                    mode: "nlapi",
                    fieldId: fid,
                    chosen: pick,
                    display: dispEl?.value ?? null,
                    options: opts.map((x) => x.text),
                };
            }
            return { ok: false, error: "Field not found or not a recognized dropdown.", fieldId: fid };
        }, opts));
        await settlePage(p);
        return { ...res, screenshot: await screenshotB64(p) };
    },
    async fill(opts) {
        const p = await ensurePage();
        await p.locator(opts.selector).first().fill(opts.value ?? "", { timeout: 10000 });
        return { ok: true };
    },
    async read(opts) {
        const p = await ensurePage();
        const max = opts.maxLength ?? 20000;
        const text = opts.selector
            ? await p.locator(opts.selector).first().innerText({ timeout: 10000 })
            : await p.evaluate(() => document.body.innerText);
        return { ok: true, text: String(text).slice(0, max) };
    },
    async eval(expression) {
        const p = await ensurePage();
        // Wrap so callers can pass either an expression or a statement body.
        const value = await p.evaluate((expr) => {
            // eslint-disable-next-line no-eval
            return (0, eval)(expr);
        }, expression);
        return { ok: true, value };
    },
    async hover(opts) {
        const p = await ensurePage();
        if (opts.selector) {
            await p.locator(opts.selector).first().hover({ timeout: 10000 });
        }
        else if (typeof opts.x === "number" && typeof opts.y === "number") {
            await p.mouse.move(opts.x, opts.y);
        }
        else {
            throw new Error("hover requires a selector or x/y coordinates.");
        }
        await p.waitForTimeout(350); // let tooltips / hover menus render
        return { ok: true, screenshot: await screenshotB64(p) };
    },
    async scroll(opts) {
        const p = await ensurePage();
        await p.evaluate(({ selector, to, dy, dx }) => {
            const target = selector
                ? document.querySelector(selector) || window
                : window;
            const el = target;
            if (to === "bottom") {
                if (target === window)
                    window.scrollTo(0, document.body.scrollHeight);
                else
                    el.scrollTop = el.scrollHeight;
            }
            else if (to === "top") {
                if (target === window)
                    window.scrollTo(0, 0);
                else
                    el.scrollTop = 0;
            }
            else {
                const deltaY = typeof dy === "number" ? dy : window.innerHeight * 0.8;
                const deltaX = typeof dx === "number" ? dx : 0;
                if (target === window)
                    window.scrollBy(deltaX, deltaY);
                else {
                    el.scrollTop += deltaY;
                    el.scrollLeft += deltaX;
                }
            }
        }, opts);
        await p.waitForTimeout(350); // let lazy-loaded rows / images render
        return { ok: true, screenshot: await screenshotB64(p) };
    },
    async close() {
        if (context)
            await context.close().catch(() => { });
        context = null;
        page = null;
    },
};
