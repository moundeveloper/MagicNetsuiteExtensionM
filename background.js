// Enable side panel
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// ENUMS
/** @type {"open" | "close"} */
const PANEL_STATE = { OPEN: "open", CLOSE: "close" };

/** @type {"panel" | "page"} */
const UI_SOURCE = { PANEL: "panel", PAGE: "page" };

/** @type {"open" | "close"} */
const CONNECT_PORT = { SIDE_PANEL: "sidePanel" };

/** @type {"Scripts" | "Custom Records"} */
const UI_VIEWS = {
  SCRIPTS: "Scripts",
  CUSTOM_RECORDS: "Custom Records"
};

// GLOBALS
let uiSource = UI_SOURCE.PANEL;
let panelState = PANEL_STATE.CLOSE;

// PORT LISTENERS
chrome.runtime.onConnect.addListener((port) => {
  const connectPortMap = {
    [CONNECT_PORT.SIDE_PANEL]: setPanelState,
    [CONNECT_PORT.DISCONNECT]: disconnectPort
  };

  const connectPortHandler = connectPortMap[port.name];
  if (!connectPortHandler) {
    console.log("Port not found:", port.name);
    return;
  }

  connectPortHandler({ port });
});

const setPanelState = ({ port }) => {
  console.log("[PortListener][setPanelState] Panel state: ", panelState);
  if (uiSource === UI_SOURCE.PANEL) {
    panelState = PANEL_STATE.OPEN;
    console.log("[PortListener][setPanelState] Panel state set to OPEN");
  }

  // It seems it doesn't disconnect if the UI page is still open, in this case when it is on mainsetup
  port.onDisconnect.addListener(() => {
    panelState = PANEL_STATE.CLOSE;
    console.log(
      "[PortListener][setPanelState] Panel state set to CLOSE (panel disconnected)"
    );
  });
};

const disconnectPort = ({ port }) => {
  port.disconnect();
  console.log("[PortListener][disconnectPort] Port disconnected");
};

// COMMANDS
chrome.commands.onCommand.addListener((command) => {
  console.log("Command:", command);
  const commandMap = {
    toggle_extension_ui: togglePanel,
    open_panel_scripts: openCommandView,
    open_panel_custom_records: openCommandView
  };

  const commandHandler = commandMap[command];
  if (!commandHandler) {
    console.log("Command not found:", command);
    return;
  }

  commandHandler({ command });
});

const togglePanel = () => {
  if (panelState === PANEL_STATE.OPEN) {
    chrome.sidePanel.setOptions({ enabled: false });
    chrome.sidePanel.setOptions({ enabled: true });
    console.log("[togglePanel] Panel closed");
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.sidePanel.open({ tabId: tab.id });
    panelState = PANEL_STATE.OPEN;
    console.log("[togglePanel] Panel opened");
  });
};

const openCommandView = ({ command }) => {
  const commandsViewMap = {
    open_panel_scripts: UI_VIEWS.SCRIPTS,
    open_panel_custom_records: UI_VIEWS.CUSTOM_RECORDS
  };

  panelState = PANEL_STATE.OPEN;
  let view = "home";

  if (!commandsViewMap[command]) {
    return;
  }

  view = commandsViewMap[command];
  // store intent ONLY
  chrome.storage.session.set({ openView: view });

  // open EXACTLY like toggle
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;
    chrome.sidePanel.open({ tabId: tab.id });
  });
};

// MESSAGE LISTENERS
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message: ", message.type);
  const messageMap = {
    CLOSE_PANEL: closeResetPanel,
    OPEN_MAIN_SETUP: createTabOnMainSetup,
    OPEN_NON_ACTIVE_TAB: openNonActiveTab,
    UI_INJECTED: isUIInjectAllowed,
    UI_SOURCE: setUISource
  };

  const messageHandler = messageMap[message.type];
  if (!messageHandler) {
    console.log("Message not found:", message.type);
    return;
  }

  const asynchronous = messageHandler({ message, sender, sendResponse });

  return asynchronous;
});

const closeResetPanel = () => {
  chrome.sidePanel.setOptions({ enabled: false });
  chrome.sidePanel.setOptions({ enabled: true });
  console.log("[OnMessage][closeResetPanel] Panel closed");

  return true;
};

const createTabOnMainSetup = ({ sender }) => {
  const tab = sender.tab;
  if (!tab || !tab.url) return;

  try {
    const url = new URL(tab.url);
    const baseUrl = `${url.protocol}//${url.hostname}`;
    const newPath = "/app/setup/mainsetup.nl";
    const newUrl = baseUrl + newPath;

    chrome.tabs.create({ url: newUrl });
  } catch (err) {
    console.error(
      "[OnMessage][createTabOnMainSetup] Invalid tab URL:",
      tab.url,
      err
    );
  }

  return true;
};

const openNonActiveTab = ({ message }) => {
  chrome.tabs.create({ url: message.url, active: false }); // active: false → background tab

  return true;
};

const isUIInjectAllowed = ({ message, sender, sendResponse }) => {
  const tab = sender.tab;
  if (!tab || !tab.url) return;

  sendResponse({
    injectAllowed: tab.url.includes("/app/setup/mainsetup.nl")
  });

  return true; // True to allow Asyncronous message
};

const setUISource = ({ message }) => {
  console.log("[OnMessage][setUISource] UI Source:", message.source);
  uiSource = message.source;

  return true; // True to allow Asyncronous message
};

// TAB LISTENERS
const notifyTabChange = (reason, tab) => {
  chrome.runtime.sendMessage({
    type: "TAB_CONTEXT_CHANGED",
    reason,
    url: tab.url,
    tabId: tab.id
  });
};

// URL changes → wait for load complete
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    notifyTabChange("url-loaded", tab);
  }
});

// Tab activated → wait until loaded
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") {
    notifyTabChange("tab-activated", tab);
  }
});

// New tab → wait for load complete
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.status === "complete" && tab.url) {
    notifyTabChange("tab-created", tab);
  }
});

// Sniff CSV files
/* chrome.downloads.onCreated.addListener((downloadItem) => {
  if (!downloadItem.finalUrl.includes(".csv")) return;
  console.log("Download detected, cancelling:", downloadItem.filename);
  console.log(downloadItem);

  chrome.downloads.cancel(downloadItem.id);

  fetch(downloadItem.finalUrl)
    .then((response) => response.text())
    .then((csv) => {
      console.log(csv);
    });
}); */

// Sniff requests

// Store request bodies to correlate with responses
/* const requestBodyMap = new Map();

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
  ["requestBody"],
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
  ["responseHeaders", "extraHeaders"],
);

// Additional listener for completed requests
chrome.webRequest.onCompleted.addListener(
  function (details) {
    console.log("=== REQUEST COMPLETED ===");
    console.log("URL:", details.url);
    console.log("Status:", details.statusCode);
    console.log("Type:", details.type);
  },
  { urls: ["*://*.netsuite.com/*"] },
);

let activeTabId = null;
 */
