// background.js

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

/** @type {"open" | "close"} */
let panelState = "close";

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "sidePanel") return;

  panelState = "open";
  console.log("Panel state set to OPEN");

  port.onDisconnect.addListener(() => {
    panelState = "close";
    console.log("Panel state set to CLOSE (panel disconnected)");
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle_extension_ui") {
    if (panelState === "open") {
      chrome.sidePanel.setOptions({ enabled: false });
      chrome.sidePanel.setOptions({ enabled: true });
      console.log("Panel closed");
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.sidePanel.open({ tabId: tab.id });
    });

    console.log("Panel opened");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "CLOSE_PANEL") return;
  chrome.sidePanel.setOptions({ enabled: false });
  chrome.sidePanel.setOptions({ enabled: true });
  console.log("Panel closed");
});

// TAB CHANGED
function notifyTabChange(reason, tab) {
  chrome.runtime.sendMessage({
    type: "TAB_CONTEXT_CHANGED",
    reason,
    url: tab.url,
    tabId: tab.id,
  });
}

// 1️⃣ URL changes → wait for load complete
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    notifyTabChange("url-loaded", tab);
  }
});

// 2️⃣ Tab activated → wait until loaded
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") {
    notifyTabChange("tab-activated", tab);
  }
});

// 3️⃣ New tab → wait for load complete
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.status === "complete" && tab.url) {
    notifyTabChange("tab-created", tab);
  }
});

// Sniff CSV files
chrome.downloads.onCreated.addListener((downloadItem) => {
  if (!downloadItem.finalUrl.includes(".csv")) return;
  console.log("Download detected, cancelling:", downloadItem.filename);
  console.log(downloadItem);

  chrome.downloads.cancel(downloadItem.id);

  fetch(downloadItem.finalUrl)
    .then((response) => response.text())
    .then((csv) => {
      console.log(csv);
    });
});

// Shortcut View
chrome.commands.onCommand.addListener((command) => {
  const commandsMap = {
    "open-panel-scripts": "Scripts",
    "open-panel-custom-records": "Custom Records",
  };

  panelState = "open";
  let view = "home";

  if (!commandsMap[command]) {
    return;
  }

  view = commandsMap[command];
  // store intent ONLY
  chrome.storage.session.set({ openView: view });

  // open EXACTLY like toggle
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;
    chrome.sidePanel.open({ tabId: tab.id });
  });
});

/* chrome.webRequest.onBeforeSendHeaders.addListener(
  async function (details) {
    console.log("=== NetSuite REQUEST ===");
    console.log("URL:", details.url);
    console.log("Method:", details.method);
    console.log("Full Details:", details);

    // Headers
    const headers = {};
    for (const h of details.requestHeaders || []) {
      headers[h.name] = h.value;
    }
    console.log("Headers:", headers);

    // Cookies
    const url = new URL(details.url);
    const cookies = await chrome.cookies.getAll({
      domain: url.hostname.replace(/^www\./, ""),
    });
    console.log("Cookies:", cookies);

    return { requestHeaders: details.requestHeaders };
  },
  { urls: ["*://*.netsuite.com/*"] },
  ["requestHeaders", "extraHeaders"]
);

chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    console.log("=== NetSuite RESPONSE ===");
    console.log("URL:", details.url);
    console.log("Status:", details.statusCode);
    console.log("Headers:", details.responseHeaders);
    console.log("Full Details:", details);
  },
  { urls: ["*://*.netsuite.com/*"] },
  ["responseHeaders", "extraHeaders"]
);

chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    console.log("Request Details:", details);
  },
  { urls: ["*://*.netsuite.com/*"] },
  ["requestBody"]
);
 */

/* // Store request bodies to correlate with responses
const requestBodyMap = new Map();

chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    console.log("=== NetSuite REQUEST BODY ===");
    console.log("URL:", details.url);
    console.log("Method:", details.method);

    // Store request body for later correlation
    if (details.requestBody) {
      let requestBody = null;

      if (details.requestBody.raw && details.requestBody.raw[0]) {
        const rawData = details.requestBody.raw[0].bytes;
        if (rawData) {
          try {
            // Convert ArrayBuffer to string
            const decoder = new TextDecoder("utf-8");
            requestBody = decoder.decode(rawData);
          } catch (e) {
            console.log("Could not decode request body:", e);
          }
        }
      } else if (details.requestBody.formData) {
        requestBody = details.requestBody.formData;
      }

      if (requestBody) {
        console.log("Request Body:", requestBody);
        // Store with URL as key for correlation
        requestBodyMap.set(details.url, {
          body: requestBody,
          timestamp: Date.now(),
        });

        // Clean up old entries (older than 5 minutes)
        const now = Date.now();
        for (const [url, data] of requestBodyMap.entries()) {
          if (now - data.timestamp > 300000) {
            // 5 minutes
            requestBodyMap.delete(url);
          }
        }
      }
    }

    console.log("Full Request Details:", details);
  },
  { urls: ["*://*.netsuite.com/*"] },
  ["requestBody"]
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  async function (details) {
    console.log("=== NetSuite REQUEST HEADERS ===");
    console.log("URL:", details.url);
    console.log("Method:", details.method);

    // Headers
    const headers = {};
    for (const h of details.requestHeaders || []) {
      headers[h.name] = h.value;
    }
    console.log("Headers:", headers);

    // Cookies
    try {
      const url = new URL(details.url);
      const cookies = await chrome.cookies.getAll({
        domain: url.hostname.replace(/^www\./, ""),
      });
      console.log("Cookies:", cookies);
    } catch (error) {
      console.log("Error getting cookies:", error);
    }

    return { requestHeaders: details.requestHeaders };
  },
  { urls: ["*://*.netsuite.com/*"] },
  ["requestHeaders", "extraHeaders"]
);

chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    console.log("=== NetSuite RESPONSE ===");
    console.log("URL:", details.url);
    console.log("Status:", details.statusCode);

    // Get corresponding request body if available
    const requestData = requestBodyMap.get(details.url);
    if (requestData) {
      console.log("Corresponding Request Body:", requestData.body);
      requestBodyMap.delete(details.url); // Clean up
    }

    // Response headers
    const responseHeaders = {};
    for (const h of details.responseHeaders || []) {
      responseHeaders[h.name] = h.value;
    }
    console.log("Response Headers:", responseHeaders);
    console.log("Full Response Details:", details);
  },
  { urls: ["*://*.netsuite.com/*"] },
  ["responseHeaders", "extraHeaders"]
);

// Additional listener for completed requests
chrome.webRequest.onCompleted.addListener(
  function (details) {
    console.log("=== REQUEST COMPLETED ===");
    console.log("URL:", details.url);
    console.log("Status:", details.statusCode);
    console.log("Type:", details.type);
  },
  { urls: ["*://*.netsuite.com/*"] }
);

let activeTabId = null;

// Start debugging when user clicks extension icon
chrome.action.onClicked.addListener((tab) => {
  activeTabId = tab.id;
  chrome.debugger.attach({ tabId: tab.id }, "1.3", () => {
    chrome.debugger.sendCommand({ tabId: tab.id }, "Network.enable");
  });
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (source.tabId !== activeTabId) return;

  if (method === "Network.responseReceived") {
    const { requestId, response } = params;

    chrome.debugger.sendCommand(
      { tabId: source.tabId },
      "Network.getResponseBody",
      { requestId },
      (responseBody) => {
        if (responseBody && !responseBody.error) {
          console.log("=== DEBUGGER RESPONSE BODY ===");
          console.log("URL:", response.url);
          console.log("Status:", response.status);
          console.log("Body:", responseBody.body);
        }
      }
    );
  }

  if (method === "Network.requestWillBeSent") {
    console.log("=== DEBUGGER REQUEST ===");
    console.log("URL:", params.request.url);
    console.log("Method:", params.request.method);
    console.log("Headers:", params.request.headers);
    console.log("Post Data:", params.request.postData);
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`=== ${message.type.toUpperCase()} ===`);

  switch (message.type) {
    case "xhr_request":
      console.log("XHR Request URL:", message.url);
      console.log("XHR Method:", message.method);
      console.log("XHR Headers:", message.headers);
      console.log("XHR Body:", message.body);
      console.log("Timestamp:", new Date(message.timestamp).toISOString());
      break;

    case "xhr_response":
      console.log("XHR Response URL:", message.url);
      console.log("XHR Status:", message.status);
      console.log("XHR Response Body:", message.responseText);
      console.log("XHR Response Headers:", message.responseHeaders);
      console.log("Timestamp:", new Date(message.timestamp).toISOString());
      break;

    case "fetch_request":
      console.log("Fetch Request URL:", message.url);
      console.log("Fetch Method:", message.method);
      console.log("Fetch Headers:", message.headers);
      console.log("Fetch Body:", message.body);
      console.log("Timestamp:", new Date(message.timestamp).toISOString());
      break;

    case "fetch_response":
      console.log("Fetch Response URL:", message.url);
      console.log("Fetch Status:", message.status);
      console.log("Fetch Response Body:", message.responseBody);
      console.log("Fetch Response Headers:", message.responseHeaders);
      console.log("Timestamp:", new Date(message.timestamp).toISOString());
      break;
  }

  console.log("Full Message:", message);
  console.log("Sender Tab:", sender.tab);

  // Optional: Store in storage for persistence
  chrome.storage.local.get(["networkLogs"], (result) => {
    const logs = result.networkLogs || [];
    logs.push(message);
    // Keep only last 1000 entries to avoid memory issues
    if (logs.length > 1000) logs.shift();
    chrome.storage.local.set({ networkLogs: logs });
  });

  sendResponse({ received: true }); // Acknowledge receipt
});

// Optional: Function to get all stored logs
function getStoredLogs() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["networkLogs"], (result) => {
      resolve(result.networkLogs || []);
    });
  });
}

// Optional: Clear logs function
function clearStoredLogs() {
  chrome.storage.local.remove(["networkLogs"]);
}

// Optional: Export logs
function exportLogs() {
  getStoredLogs().then((logs) => {
    const dataStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url: url,
      filename: `netsuite-logs-${Date.now()}.json`,
    });
  });
}
 */
