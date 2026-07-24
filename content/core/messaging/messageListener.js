import {
  MESSAGE_TYPES,
  REQUEST_MODES,
  generateRequestId
} from "./constants.js";
import { StreamHandler, NormalRequestHandler } from "./handlers.js";
import { RequestManager } from "./requestManager.js";
import { scrapeSuiteScriptModules } from "../../modules/suiteScriptScraper.js";

const requestManager = new RequestManager();

const SCRAPE_ACTION = "SCRAPE_SUITESCRIPT_MODULES";
const MAX_DOC_LINKS = 200;

const SKIP_DOC_TEXT_TAGS = new Set(["script", "style", "noscript", "svg"]);
const BLOCK_DOC_TEXT_TAGS = new Set([
  "article", "aside", "blockquote", "div", "dl", "fieldset", "figure", "footer",
  "form", "header", "main", "nav", "ol", "p", "section", "table", "ul"
]);
const HEADING_DOC_TEXT_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const normalizeDocWhitespace = (text) =>
  text
    .replace(/\r/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const escapeMarkdownLinkText = (text) =>
  text.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");

const toAbsoluteDocUrl = (href, pageUrl) => {
  const raw = String(href ?? "").trim();
  if (!raw) return "";

  const lower = raw.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("mailto:") || lower.startsWith("tel:")) {
    return "";
  }

  try {
    const absolute = new URL(raw, pageUrl).href;
    return absolute.startsWith("http://") || absolute.startsWith("https://") ? absolute : "";
  } catch {
    return "";
  }
};

const getNearestDocHeading = (element) => {
  let current = element;
  while (current) {
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (HEADING_DOC_TEXT_TAGS.has(sibling.tagName.toLowerCase())) {
        return normalizeDocWhitespace(sibling.textContent ?? "");
      }
      const nestedHeadings = Array.from(sibling.querySelectorAll("h1,h2,h3,h4,h5,h6"));
      const heading = nestedHeadings[nestedHeadings.length - 1];
      if (heading) return normalizeDocWhitespace(heading.textContent ?? "");
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }
  return "";
};

const extractHelpPageContent = (root, pageUrl) => {
  const links = [];
  const seenLinks = new Set();

  const addLink = (anchor, text, url) => {
    if (!url) return;
    const normalizedText = normalizeDocWhitespace(text) || url;
    const key = `${normalizedText}\n${url}`;
    if (seenLinks.has(key)) return;
    seenLinks.add(key);

    if (links.length < MAX_DOC_LINKS) {
      const section = getNearestDocHeading(anchor);
      links.push({
        text: normalizedText,
        url,
        ...(section ? { section } : {})
      });
    }
  };

  const serializeChildren = (element) =>
    Array.from(element.childNodes).map(serializeNode).join("");

  const serializeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent ?? "").replace(/\s+/g, " ");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node;
    const tagName = element.tagName.toLowerCase();
    if (SKIP_DOC_TEXT_TAGS.has(tagName)) return "";

    if (tagName === "br") return "\n";

    if (tagName === "a") {
      const text = normalizeDocWhitespace(serializeChildren(element) || element.textContent || "");
      const absoluteUrl = toAbsoluteDocUrl(element.getAttribute("href"), pageUrl);
      if (!absoluteUrl) return text;

      addLink(element, text, absoluteUrl);
      return `[${escapeMarkdownLinkText(text || absoluteUrl)}](${absoluteUrl})`;
    }

    if (tagName === "pre") {
      return `\n\n${(element.textContent ?? "").trim()}\n\n`;
    }

    if (tagName === "code") {
      return `\`${normalizeDocWhitespace(element.textContent ?? "")}\``;
    }

    if (tagName === "li") {
      return `\n- ${normalizeDocWhitespace(serializeChildren(element))}`;
    }

    if (tagName === "tr") {
      const cells = Array.from(element.children)
        .filter(child => ["td", "th"].includes(child.tagName.toLowerCase()))
        .map(child => normalizeDocWhitespace(serializeChildren(child)))
        .filter(Boolean);
      return cells.length ? `\n${cells.join(" | ")}` : "";
    }

    if (HEADING_DOC_TEXT_TAGS.has(tagName)) {
      return `\n\n${normalizeDocWhitespace(serializeChildren(element))}\n\n`;
    }

    const content = serializeChildren(element);
    return BLOCK_DOC_TEXT_TAGS.has(tagName) ? `\n\n${content}\n\n` : content;
  };

  const content = normalizeDocWhitespace(serializeNode(root));

  return {
    content,
    links,
    linkCount: seenLinks.size,
    linksTruncated: seenLinks.size > links.length
  };
};

export const setupMessageListener = () => {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "stream-api") return;

    port.onMessage.addListener((msg) => {
      const { action, data, mode, tabId } = msg;
      const requestId = generateRequestId();

      if (mode !== REQUEST_MODES.STREAM) return;

      // ── Intercept: scrape docs directly in content script ──
      if (action === SCRAPE_ACTION) {
        scrapeSuiteScriptModules(data?.baseUrl, (chunk) => {
          port.postMessage({ ...chunk, requestId });
        });
        return;
      }

      const handler = new StreamHandler(requestId, (chunk) => {
        port.postMessage(chunk);
      });

      requestManager.addRequest(requestId, handler);
      handler.start();

      // Send to page context (content script → page)
      window.postMessage(
        {
          type: MESSAGE_TYPES.FROM_EXTENSION,
          payload: {
            action,
            data,
            requestId,
            mode
          }
        },
        "*"
      );
    });

    port.onDisconnect.addListener(() => {
      requestManager.abortAll();
    });
  });

  // ============================================================================
  // NORMAL REQUEST HANDLING (UNCHANGED)
  // ============================================================================

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const { action, data, mode = REQUEST_MODES.NORMAL } = msg;
    const requestId = generateRequestId();

    if (mode !== REQUEST_MODES.NORMAL) return;

    // Handle FETCH_HELP_PAGE directly in the content script isolated world.
    // Content scripts have extension-level fetch privileges (cross-origin +
    // session cookies) AND full browser APIs (DOMParser) — both of which are
    // unavailable or unreliable in the background service worker.
    if (action === "FETCH_HELP_PAGE") {
      const url = data?.url ?? "";
      const operation = data?.operation ?? "read"; // "search" | "read"
      const baseUrl = data?.baseUrl ?? "";

      fetch(url, { credentials: "include" })
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        })
        .then(html => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");

          if (operation === "search") {
            const titleEls = doc.querySelectorAll(".result-title");
            const bodyEls = doc.querySelectorAll(".result-body");
            const results = [];
            titleEls.forEach((titleEl, i) => {
              const anchor = titleEl.querySelector("a");
              const title = (anchor?.textContent ?? titleEl.textContent ?? "").trim();
              const href = anchor?.getAttribute("href") ?? "";
              const fullUrl = toAbsoluteDocUrl(href, url || baseUrl);
              const summary = (bodyEls[i]?.textContent ?? "").trim();
              if (title && fullUrl) results.push({ title, url: fullUrl, summary });
            });
            sendResponse({ status: "ok", message: { results } });
          } else {
            const el =
              doc.getElementById("nshelp_page") ??
              doc.querySelector(".nshelp_page") ??
              doc.querySelector("main") ??
              doc.body;
            const title = normalizeDocWhitespace(
              el?.querySelector("h1")?.textContent ??
              doc.querySelector("title")?.textContent ??
              ""
            );
            const extracted = extractHelpPageContent(el, url);
            sendResponse({ status: "ok", message: { title, ...extracted } });
          }
        })
        .catch(e => sendResponse({ status: "error", message: String(e?.message ?? e) }));
      return true;
    }

    // ── Bundle list / components — fetch & parse CSV in content script ─────
    // Mirrors the same approach as FETCH_HELP_PAGE: content script has
    // credentialed fetch access + synchronous DOM APIs for CSV parsing.

    /** Parse a single CSV line handling quoted fields. */
    const parseCSVLine = (line) => {
      const result = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else { inQuotes = !inQuotes; }
        } else if (char === "," && !inQuotes) {
          result.push(current.trim()); current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    if (action === "FETCH_BUNDLES") {
      const { domain, bundleType = "both" } = data ?? {};

      const FIELD_MAP = {
        Name: "name", "Bundle ID": "bundleId", Version: "version",
        "App ID": "appId", Abstract: "abstract", "Created By": "createdBy",
        "Created On": "createdOn", "Last Update": "lastUpdate",
      };

      const fetchType = (type) => {
        const url = `https://${domain}/app/bundler/bundlelist.csv?type=${type}&sortcol=bundlename&sortdir=ASC&csv=Export`;
        const labeledType = type === "I" ? "installed" : "created";
        return fetch(url, { credentials: "include" })
          .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
          .then(csv => {
            const lines = csv.split("\n").filter(l => l.trim() !== "");
            if (lines.length < 2) return [];
            lines.shift();
            const headers = parseCSVLine(lines[0]);
            const bundles = [];
            for (let i = 1; i < lines.length; i++) {
              const values = parseCSVLine(lines[i]);
              const obj = { type: labeledType };
              headers.forEach((h, idx) => { if (FIELD_MAP[h]) obj[FIELD_MAP[h]] = values[idx] ?? ""; });
              if (obj.bundleId) bundles.push(obj);
            }
            return bundles;
          });
      };

      const typesToFetch = bundleType === "I" ? ["I"] : bundleType === "S" ? ["S"] : ["I", "S"];

      Promise.all(typesToFetch.map(fetchType))
        .then(results => {
          const bundles = results.flat();
          sendResponse({ status: "ok", message: { bundles } });
        })
        .catch(e => sendResponse({ status: "error", message: String(e?.message ?? e) }));
      return true;
    }

    if (action === "FETCH_BUNDLE_COMPONENTS") {
      const { domain, bundleId } = data ?? {};
      const partBeforeDot = (domain ?? "").split(".")[0] ?? "";
      const fetchCompId = partBeforeDot.toLowerCase().replace(/-/g, "_");
      const url = `https://${domain}/app/bundler/bundlecontents.csv?csv=Export&OfficeXML=F&id=${bundleId}&fetchcompid=${fetchCompId}`;

      const isMarker = (line) => {
        if (!line) return false;
        const cols = parseCSVLine(line);
        return Boolean(cols[0]) && !cols[1] && !cols[2] && !cols[3];
      };

      fetch(url, { credentials: "include" })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
        .then(csv => {
          const lines = csv.split("\n").filter(l => l.trim() !== "");
          if (lines.length < 2) { sendResponse({ status: "ok", message: { components: [] } }); return; }
          let currentCategory = "", currentSubCategory = "";
          const components = [];
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const next = lines[i + 1] ?? "";
            if (isMarker(line)) {
              if (next && !isMarker(next)) { currentSubCategory = parseCSVLine(line)[0] ?? ""; }
              else { currentCategory = parseCSVLine(line)[0] ?? ""; currentSubCategory = ""; }
              continue;
            }
            const [name, id, referencedBy, isLockedStr] = parseCSVLine(line);
            if (!name) continue;
            components.push({ name, id: id ?? "", referencedBy: referencedBy ?? "",
              isLocked: Boolean(isLockedStr), category: currentCategory, subCategory: currentSubCategory });
          }
          sendResponse({ status: "ok", message: { components } });
        })
        .catch(e => sendResponse({ status: "error", message: String(e?.message ?? e) }));
      return true;
    }

    const getBundleDetailsUrl = (domain, bundleId) => {
      const accountDomain = (domain ?? "").split(".")[0] ?? "";
      const sourceCompanyId = accountDomain.replace(/-/g, "_").toUpperCase();
      const url = new URL(`https://${domain}/app/bundler/bundledetails.nl`);
      url.searchParams.set("selectedtab", "tab");
      url.searchParams.set("id", String(bundleId));
      url.searchParams.set("sourcecompanyid", sourceCompanyId);
      url.searchParams.set(
        "domain",
        String(domain).toLowerCase().includes("-sb") ? "SANDBOX" : "PRODUCTION"
      );
      url.searchParams.set("loadsuiteappdata", "T");
      url.searchParams.set("whence", "");
      return url.toString();
    };

    if (action === "CHECK_BUNDLE_SDF_CONVERSION") {
      const { domain, bundleId } = data ?? {};
      const detailsUrl = getBundleDetailsUrl(domain, bundleId);

      fetch(detailsUrl, { credentials: "include" })
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status} checking SDF conversion status`);
          return r.text();
        })
        .then(html => {
          const openingTag = (html.match(/<button\b[^>]*>/gi) ?? []).find(tag =>
            /\bid\s*=\s*(["'])converttoacp\1/i.test(tag)
          );
          const buttonFound = Boolean(openingTag);
          const disabled = openingTag
            ? /\sdisabled(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=\s|>)/i.test(openingTag)
            : false;
          sendResponse({
            status: "ok",
            message: {
              buttonFound,
              disabled,
              canConvert: buttonFound && !disabled,
              inProgress: buttonFound && disabled,
              detailsUrl,
            },
          });
        })
        .catch(e => sendResponse({ status: "error", message: String(e?.message ?? e) }));
      return true;
    }

    if (action === "START_BUNDLE_SDF_CONVERSION") {
      const { domain, bundleId, detailsUrl: suppliedDetailsUrl } = data ?? {};
      const detailsUrl = suppliedDetailsUrl || getBundleDetailsUrl(domain, bundleId);
      const conversionUrl = new URL(
        `https://${domain}/app/suiteapp/bundlesuiteappconvert/convert.nl`
      );
      conversionUrl.searchParams.set("bundleid", String(bundleId));

      fetch(conversionUrl, {
        method: "GET",
        credentials: "include",
        referrer: detailsUrl,
        referrerPolicy: "strict-origin-when-cross-origin",
      })
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status} starting SDF conversion`);
          sendResponse({ status: "ok", message: { started: true } });
        })
        .catch(e => sendResponse({ status: "error", message: String(e?.message ?? e) }));
      return true;
    }

    const handler = new NormalRequestHandler(requestId, sendResponse);
    requestManager.addRequest(requestId, handler);
    handler.start();

    window.postMessage(
      {
        type: MESSAGE_TYPES.FROM_EXTENSION,
        payload: { ...msg, requestId }
      },
      "*"
    );

    return true;
  });

  // Cleanup on unload
  window.addEventListener("beforeunload", () => {
    console.log("Content script unloading, aborting all requests...");
    requestManager.abortAll();
  });
};
