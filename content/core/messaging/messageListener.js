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
              const fullUrl = href.startsWith("http") ? href : href ? `${baseUrl}${href}` : "";
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
            const content = (el?.textContent ?? "").trim();
            sendResponse({ status: "ok", message: { content } });
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
