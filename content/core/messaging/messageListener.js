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
    const { action, mode = REQUEST_MODES.NORMAL } = msg;
    const requestId = generateRequestId();

    if (mode !== REQUEST_MODES.NORMAL) return;

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
