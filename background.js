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

// ── MCP: SuiteQL Agent Guide ──
// Returned by the suiteql_get_guide tool so AI agents know exactly
// how to use these tools without guessing or producing invalid SQL.
const SUITEQL_GUIDE = `
# SuiteQL Agent Guide — NetSuite MCP Server

## CRITICAL RULES

### 1. NEVER USE \`LIMIT\`
SuiteQL is built on Oracle SQL. \`LIMIT\` does NOT exist and will throw an error.
Use ROWNUM in a WHERE clause instead:
  CORRECT: SELECT id, name FROM customer WHERE ROWNUM <= 10
  WRONG:   SELECT id, name FROM customer LIMIT 10

### 2. ALWAYS FOLLOW THE DISCOVERY WORKFLOW
Never guess table names or column names — always verify first:
  Step 1: suiteql_search_tables        — find the right table
  Step 2: suiteql_get_table_fields     — get valid column names + types
  Step 3: suiteql_discover_field_values — get valid values for WHERE filters
  Step 4: suiteql_execute_query        — run the final verified query

### 3. ALWAYS LIMIT ROWS
Every query must include a ROWNUM guard to prevent runaway results:
  WHERE ROWNUM <= 25

## SYNTAX REFERENCE

Row limiting (mandatory):
  WHERE ROWNUM <= 25

Date filtering:
  WHERE trandate >= TO_DATE('2024-01-01', 'YYYY-MM-DD')

NULL checks:
  WHERE fieldname IS NOT NULL
  WHERE fieldname IS NULL

String comparison (case-sensitive in SuiteQL):
  WHERE status = 'A'

Numeric ID join pattern:
  JOIN customer ON transaction.entity = customer.id

Text search (slow — use only when necessary):
  WHERE LOWER(name) LIKE '%keyword%'

## COMMON TABLES
  customer            Customer master records
  transaction         All transaction types (invoices, bills, POs, etc.)
  item                Inventory / non-inventory / service items
  vendor              Vendor records
  employee            Employee records
  account             Chart of accounts
  contact             Contact records
  customrecord_*      Custom record types — discover with suiteql_search_tables

## FULL WORKFLOW EXAMPLE
Goal: Find open invoices for customer ID 123

  1. suiteql_search_tables("transaction")
     → confirms table name is "transaction"

  2. suiteql_get_table_fields("transaction")
     → reveals columns: id, tranid, entity, status, type, trandate, amount

  3. suiteql_discover_field_values("transaction", "type")
     → invoice type value = "CustInvc"

  4. suiteql_discover_field_values("transaction", "status")
     → open invoice status = "CustInvc:A"

  5. suiteql_execute_query:
       SELECT t.id, t.tranid, t.trandate, t.amount
       FROM transaction t
       WHERE t.type = 'CustInvc'
         AND t.status = 'CustInvc:A'
         AND t.entity = 123
         AND ROWNUM <= 25

## JOINS
Always call suiteql_get_table_joins before writing JOIN clauses.
The join column names are not always obvious.
`.trim();

// ── MCP: Usage Tracking ──
const mcpUsageLog = [];
const MCP_USAGE_MAX = 100;

const recordMcpUsage = (toolName, success, errorMsg) => {
  mcpUsageLog.unshift({
    tool: toolName,
    timestamp: new Date().toISOString(),
    success,
    error: errorMsg || null
  });
  if (mcpUsageLog.length > MCP_USAGE_MAX) {
    mcpUsageLog.length = MCP_USAGE_MAX;
  }
};

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
    UI_SOURCE: setUISource,
    MCP_CONNECT: handleMcpConnect,
    MCP_DISCONNECT: handleMcpDisconnect,
    MCP_STATUS: handleMcpStatus,
    MCP_USAGE: handleMcpUsage,
    MCP_USAGE_CLEAR: handleMcpUsageClear,
    MCP_GET_TOOLS: handleMcpGetTools,
    MCP_INSTALL_INFO: handleMcpInstallInfo
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

// MCP MESSAGE HANDLERS
const handleMcpConnect = ({ sendResponse }) => {
  mcpConnect().then(() => {
    sendResponse({
      status: getMcpBridgeStatus(),
      connections: getMcpConnectionDetails(),
      dedicatedTab: getMcpDedicatedTabInfo()
    });
  });
  return true; // async
};

const handleMcpDisconnect = ({ sendResponse }) => {
  mcpDisconnect().then(() => {
    sendResponse({
      status: "disconnected",
      connections: getMcpConnectionDetails(),
      dedicatedTab: getMcpDedicatedTabInfo()
    });
  });
  return true;
};

const handleMcpStatus = ({ sendResponse }) => {
  sendResponse({
    status: getMcpBridgeStatus(),
    connections: getMcpConnectionDetails(),
    dedicatedTab: getMcpDedicatedTabInfo()
  });
  return true;
};

const handleMcpUsage = ({ sendResponse }) => {
  const stats = {};
  mcpUsageLog.forEach((entry) => {
    if (!stats[entry.tool]) {
      stats[entry.tool] = { calls: 0, errors: 0 };
    }
    stats[entry.tool].calls++;
    if (!entry.success) {
      stats[entry.tool].errors++;
    }
  });
  sendResponse({ log: mcpUsageLog, stats });
  return true;
};

const handleMcpUsageClear = ({ sendResponse }) => {
  mcpUsageLog.length = 0;
  sendResponse({ ok: true });
  return true;
};

const handleMcpInstallInfo = ({ sendResponse }) => {
  sendResponse({ extensionId: chrome.runtime.id });
  return true;
};

const handleMcpGetTools = ({ sendResponse }) => {
  // Return ALL tool definitions — the UI needs to see disabled tools too so users can re-enable them.
  const tools = MCP_TOOL_DEFINITIONS.map(({ name, description }) => ({ name, description }));
  sendResponse(tools);
  return true;
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

/* MCP SERVER */
// background.js — Chrome Extension Service Worker
// Uses Chrome Native Messaging instead of scanning localhost bridge ports.
// Chrome starts the native host; the host owns a local named-pipe relay used by
// any AI-facing MCP stdio process that needs to call into the extension.
const MCP_NATIVE_HOST_NAME = "com.magicnetsuite.mcp_bridge";

let mcpNativePort = null;
let mcpNativeConnecting = false;
let mcpNativeLastError = null;

// ── MCP: Dedicated Tab for Governance ──
// When a tab runs out of SuiteScript governance, the MCP server creates a
// persistent (non-temporary) tab on mainsetup.nl for the preferred account.
// This tab stays open and auto-refreshes when governance drops below the threshold.
let mcpDedicatedTabId = null;
let mcpDedicatedTabAccountId = null;
const MCP_GOVERNANCE_THRESHOLD = 100;
let mcpDedicatedTabRefreshing = false;
let mcpDedicatedTabCreating = false;

// ── MCP: Direct Queries to Native Host ──
// Allows the side panel to query the native host directly (e.g. for install path)
// without going through the MCP client request pipeline.
let mcpDirectQueryId = 0;
const mcpDirectQueryPending = new Map();

function queryNativeHostDirect(message) {
  return new Promise((resolve, reject) => {
    if (!mcpNativePort) {
      reject(new Error("Native host not connected"));
      return;
    }
    const requestId = `direct-${++mcpDirectQueryId}`;
    const timer = setTimeout(() => {
      mcpDirectQueryPending.delete(requestId);
      reject(new Error("Native host query timeout"));
    }, 5000);

    const pending = {
      resolve,
      reject,
      timer
    };

    mcpDirectQueryPending.set(requestId, pending);
    try {
      mcpNativePort.postMessage({ ...message, requestId });
    } catch (err) {
      mcpDirectQueryPending.delete(requestId);
      clearTimeout(timer);
      reject(err);
    }
  });
}

// -----------------------------
// Entry point: check settings and connect if enabled
// -----------------------------
(async () => {
  const mcpEnabled = await isMcpEnabled();
  if (mcpEnabled) {
    mcpConnect();
  }
})();

// -----------------------------
// MCP enabled check
// -----------------------------
async function isMcpEnabled() {
  try {
    const result = await chrome.storage.sync.get(["magic_netsuite_settings"]);
    return result?.magic_netsuite_settings?.mcpEnabled !== false; // default true
  } catch {
    return true;
  }
}

// -----------------------------
// Public connect/disconnect
// -----------------------------
async function mcpConnect() {
  if (mcpNativePort || mcpNativeConnecting) return;

  mcpNativeConnecting = true;
  mcpNativeLastError = null;

  try {
    const port = chrome.runtime.connectNative(MCP_NATIVE_HOST_NAME);
    mcpNativePort = port;

    port.onMessage.addListener((message) => {
      handleNativeBridgeMessage(port, message);
    });

    port.onDisconnect.addListener(() => {
      const message = chrome.runtime.lastError?.message || null;
      mcpNativeLastError = message;
      console.warn("[MCP Native Bridge] disconnected", message || "");
      if (mcpNativePort === port) {
        mcpNativePort = null;
      }
    });

    port.postMessage({
      type: "extensionReady",
      name: "Magic Netsuite",
      version: chrome.runtime.getManifest?.().version || "unknown"
    });

    console.log("[MCP Native Bridge] connected to native host");
  } catch (err) {
    mcpNativePort = null;
    mcpNativeLastError = err instanceof Error ? err.message : String(err);
    console.error("[MCP Native Bridge] failed to connect", err);
  } finally {
    mcpNativeConnecting = false;
  }
}

async function mcpDisconnect() {
  if (mcpNativePort) {
    try { mcpNativePort.disconnect(); } catch {}
  }
  mcpNativePort = null;
  mcpNativeConnecting = false;
  console.log("[MCP Native Bridge] manually disconnected");
}

function getMcpBridgeStatus() {
  return mcpNativePort ? "connected" : "disconnected";
}

function getMcpConnectionDetails() {
  return [
    {
      id: MCP_NATIVE_HOST_NAME,
      label: "Native host",
      state: mcpNativePort ? "open" : "closed",
      error: mcpNativeLastError
    }
  ];
}

function getMcpDedicatedTabInfo() {
  return mcpDedicatedTabId
    ? { tabId: mcpDedicatedTabId, accountId: mcpDedicatedTabAccountId }
    : null;
}

// -----------------------------
// MCP Dedicated Tab Management
//
// When an MCP tool call detects low governance on the selected tab, it creates
// a persistent tab at /app/setup/mainsetup.nl for the preferred account.
// This tab stays open (not temporary) and auto-refreshes to replenish
// governance when it drops below MCP_GOVERNANCE_THRESHOLD.
// -----------------------------

/**
 * Checks SuiteScript governance remaining on a tab.
 * Returns the remaining units or -1 if unknown.
 */
async function checkTabGovernance(tabId) {
  try {
    const response = await sendMessageToTab(tabId, {
      action: "CHECK_GOVERNANCE",
      data: {},
      mode: "normal"
    });
    if (response?.status === "ok" && response.message?.remaining !== undefined) {
      return response.message.remaining;
    }
    return -1;
  } catch {
    return -1;
  }
}

/**
 * Waits for a tab to finish loading (status = "complete").
 * Resolves once the tab is ready.
 */
function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Tab ${tabId} did not finish loading in ${timeoutMs}ms`));
    }, timeoutMs);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        // Allow a small delay for the content script to initialize
        setTimeout(() => resolve(), 500);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // Check if the tab is already complete
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error(`Tab ${tabId} no longer exists`));
        return;
      }
      if (tab.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(() => resolve(), 500);
      }
    });
  });
}

/**
 * Creates a persistent dedicated MCP tab for the given account domain.
 * This is NOT a temporary tab — it stays open and is reused across MCP calls.
 */
async function createMcpDedicatedTab(accountDomain) {
  // Guard: if another creation is in progress, wait for it to finish
  if (mcpDedicatedTabCreating) {
    console.log(`[MCP Dedicated Tab] Creation already in progress, waiting...`);
    return waitForExistingDedicatedTab(accountDomain);
  }

  const url = `https://${accountDomain}/app/setup/mainsetup.nl?sc=-90`;

  console.log(`[MCP Dedicated Tab] Creating persistent tab for ${accountDomain}`);

  mcpDedicatedTabCreating = true;

  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, async (tab) => {
      if (!tab?.id) {
        mcpDedicatedTabCreating = false;
        return reject(new Error("Failed to create dedicated MCP tab"));
      }

      try {
        await waitForTabComplete(tab.id);
        mcpDedicatedTabId = tab.id;
        mcpDedicatedTabAccountId = extractAccountIdFromUrl(tab.url || url);
        mcpDedicatedTabCreating = false;
        console.log(`[MCP Dedicated Tab] Created tab ${tab.id} for account ${mcpDedicatedTabAccountId}`);
        resolve(tab);
      } catch (err) {
        mcpDedicatedTabCreating = false;
        // Tab failed to load — clean up
        try { chrome.tabs.remove(tab.id); } catch {}
        reject(err);
      }
    });
  });
}

/**
 * Waits for an already-in-progress dedicated tab creation to complete.
 * Polls every 200ms up to 30s for mcpDedicatedTabId to be set.
 */
async function waitForExistingDedicatedTab(accountDomain) {
  const start = Date.now();
  const timeout = 30000;
  while (Date.now() - start < timeout) {
    if (mcpDedicatedTabId) {
      const tab = await validateDedicatedTab();
      if (tab) return tab;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  // Timed out — the creating call might have failed; create a new one
  console.warn(`[MCP Dedicated Tab] Timed out waiting for existing creation, forcing new tab`);
  mcpDedicatedTabCreating = false;
  return createMcpDedicatedTab(accountDomain);
}

/**
 * Returns the domain (hostname) for a given account ID by finding a matching
 * NetSuite tab's URL. Falls back to constructing it from the account ID.
 */
function getAccountDomain(accountId) {
  // Convert account ID format (e.g. "9937091_SB1") back to subdomain format ("9937091-sb1")
  const subdomain = accountId.toLowerCase().replace(/_/g, "-");
  return `${subdomain}.app.netsuite.com`;
}

/**
 * Validates the dedicated MCP tab still exists and is usable.
 * Returns the tab if valid, null otherwise.
 */
async function validateDedicatedTab() {
  if (!mcpDedicatedTabId) return null;

  try {
    const tab = await chrome.tabs.get(mcpDedicatedTabId);
    if (!tab || !tab.url?.includes("app.netsuite.com")) {
      // Tab was closed or navigated away
      mcpDedicatedTabId = null;
      mcpDedicatedTabAccountId = null;
      return null;
    }

    // Check that the content script is still connected
    const response = await sendMessageToTab(tab.id, {
      action: "CHECK_CONNECTION",
      data: {},
      mode: "normal"
    });

    if (response?.message !== "connected") {
      mcpDedicatedTabId = null;
      mcpDedicatedTabAccountId = null;
      return null;
    }

    return tab;
  } catch {
    mcpDedicatedTabId = null;
    mcpDedicatedTabAccountId = null;
    return null;
  }
}

/**
 * Refreshes the dedicated MCP tab to replenish governance.
 * Reloads the tab and waits for it to finish loading.
 */
async function refreshDedicatedTab() {
  if (!mcpDedicatedTabId || mcpDedicatedTabRefreshing) return;

  mcpDedicatedTabRefreshing = true;
  console.log(`[MCP Dedicated Tab] Refreshing tab ${mcpDedicatedTabId} to replenish governance`);

  try {
    chrome.tabs.reload(mcpDedicatedTabId);
    await waitForTabComplete(mcpDedicatedTabId);
    console.log(`[MCP Dedicated Tab] Tab ${mcpDedicatedTabId} refreshed successfully`);
  } catch (err) {
    console.error(`[MCP Dedicated Tab] Failed to refresh tab: ${err.message}`);
    // Tab may have been closed — invalidate
    mcpDedicatedTabId = null;
    mcpDedicatedTabAccountId = null;
  } finally {
    mcpDedicatedTabRefreshing = false;
  }
}

/**
 * Checks governance on the dedicated tab and refreshes it if below threshold.
 * Called after each MCP tool call to ensure the tab is ready for the next call.
 */
async function checkAndRefreshDedicatedTabGovernance() {
  if (!mcpDedicatedTabId) return;

  const remaining = await checkTabGovernance(mcpDedicatedTabId);
  if (remaining !== -1 && remaining < MCP_GOVERNANCE_THRESHOLD) {
    console.log(`[MCP Dedicated Tab] Governance low (${remaining} remaining), refreshing tab`);
    await refreshDedicatedTab();
  }
}

// Listen for tab removal to clear the dedicated tab reference
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === mcpDedicatedTabId) {
    console.log(`[MCP Dedicated Tab] Tab ${tabId} was closed`);
    mcpDedicatedTabId = null;
    mcpDedicatedTabAccountId = null;
  }
});

// Listen for account preference changes to reset the dedicated tab
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  const settingsChange = changes.magic_netsuite_settings;
  if (!settingsChange) return;

  const oldAccount = settingsChange.oldValue?.mcpPreferredAccount || "";
  const newAccount = settingsChange.newValue?.mcpPreferredAccount || "";

  if (oldAccount !== newAccount && mcpDedicatedTabId) {
    console.log(
      `[MCP Dedicated Tab] Account changed from "${oldAccount}" to "${newAccount}" — ` +
      `dedicated tab ${mcpDedicatedTabId} will no longer be used`
    );
    // Don't close the old tab (it may be useful for other work),
    // just stop using it as the dedicated MCP tab.
    mcpDedicatedTabId = null;
    mcpDedicatedTabAccountId = null;
  }
});

// -----------------------------
// Native host message handling
// -----------------------------
async function handleNativeBridgeMessage(port, message) {
  console.debug("[MCP Native Bridge] ←", message);

  // Handle direct query responses (not MCP client pipeline)
  if (message.type === "BASE_DIR" && message.requestId) {
    const pending = mcpDirectQueryPending.get(message.requestId);
    if (pending) {
      mcpDirectQueryPending.delete(message.requestId);
      clearTimeout(pending.timer);
      pending.resolve(message);
    }
    return;
  }

  const response = await handleRequest(message);

  console.debug("[MCP Native Bridge] →", response);

  try {
    port.postMessage(response);
  } catch (err) {
    mcpNativeLastError = err instanceof Error ? err.message : String(err);
    console.error("[MCP Native Bridge] failed to post response", err);
  }
}

// -----------------------------
// MCP Tool Definitions
// -----------------------------
const MCP_TOOL_DEFINITIONS = [
  {
    name: "ping",
    description: "Ping the Chrome extension. Returns pong.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Optional message to echo back"
        }
      }
    }
  },
  {
    name: "suiteql_get_guide",
    description:
      "CALL THIS FIRST before any SuiteQL work. Returns the complete usage guide: correct syntax rules (no LIMIT — use ROWNUM), the mandatory discovery workflow, common table names, and worked examples.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  // ── SuiteQL Tools ──
  {
    name: "suiteql_search_tables",
    description: "Search available SuiteQL tables by keyword. Returns table IDs and labels matching the search term.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keyword to filter tables (e.g. 'customer', 'transaction'). Leave empty to list all tables."
        }
      }
    }
  },
  {
    name: "suiteql_get_table_fields",
    description: "Get all columns/fields for a specific SuiteQL table. Returns field IDs, labels, and data types.",
    inputSchema: {
      type: "object",
      properties: {
        tableName: {
          type: "string",
          description: "The exact table ID (e.g. 'customer', 'transaction', 'item')."
        }
      },
      required: ["tableName"]
    }
  },
  {
    name: "suiteql_get_table_joins",
    description: "Get available joins/relationships for a specific SuiteQL table. Returns join labels, target tables, and join conditions.",
    inputSchema: {
      type: "object",
      properties: {
        tableName: {
          type: "string",
          description: "The exact table ID to get joins for."
        }
      },
      required: ["tableName"]
    }
  },
  {
    name: "suiteql_execute_query",
    description: "Execute a SuiteQL query. NEVER use LIMIT — it is not valid SuiteQL syntax and will error. Use ROWNUM in a WHERE clause to limit rows: WHERE ROWNUM <= 25",
    inputSchema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "Valid SuiteQL query. Must use ROWNUM <= N for row limiting, never LIMIT."
        }
      },
      required: ["sql"]
    }
  },
  {
    name: "suiteql_discover_field_values",
    description: "Sample DISTINCT actual values for a specific column in a table. Use this to discover exact values for WHERE clauses.",
    inputSchema: {
      type: "object",
      properties: {
        tableName: {
          type: "string",
          description: "The exact table ID (e.g. 'transaction', 'customrecord_foo')."
        },
        fieldId: {
          type: "string",
          description: "The column ID to sample values for (e.g. 'status', 'custrecord_ctkc_enrichment_status')."
        }
      },
      required: ["tableName", "fieldId"]
    }
  },
  // ── NetSuite Docs Tools ──
  {
    name: "netsuite_search_docs",
    description:
      "Search the official NetSuite help documentation. Returns a list of matching pages with title, URL, and summary. Use this first to find relevant documentation, then call 'netsuite_read_doc_page' with a returned URL to get the full content. Always use this tool for any factual question about NetSuite — do NOT answer from training data.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keywords (e.g. 'SuiteScript record load', 'saved search filters', 'revenue recognition')."
        }
      },
      required: ["query"]
    }
  },
  {
    name: "netsuite_read_doc_page",
    description:
      "Read a NetSuite documentation page. Pass a URL returned by 'netsuite_search_docs' or a link returned by a previous 'netsuite_read_doc_page' call. Returns the page's main text (up to 10 000 characters) with inline Markdown links preserved, plus a structured links array for deeper follow-up research. Always include a References section with the page URL in your response after reading.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full NetSuite help center URL, either from netsuite_search_docs results or from the links array returned by netsuite_read_doc_page."
        }
      },
      required: ["url"]
    }
  },
  // ── Script Tools ──
  {
    name: "netsuite_get_scripts",
    description:
      "Search and list scripts from a live NetSuite account. Returns scriptid, id, name, scripttype, owner, scriptfile. " +
      "Supports SQL-level filtering by scriptId (exact match), scriptType, name (partial match), and owner (partial match) — these run server-side and reduce data transfer. " +
      "Also supports a client-side 'search' parameter for fuzzy keyword matching across all fields when you don't know which field to filter on. " +
      "Call with no parameters to list ALL scripts. Pass the numeric 'id' values to netsuite_get_script_files to read source code.",
    inputSchema: {
      type: "object",
      properties: {
        scriptId: {
          type: "string",
          description: "Exact script ID string (e.g. 'customscript_my_suitelet'). Only use when you know the full exact ID."
        },
        scriptType: {
          type: "string",
          description: "Filter by script type (e.g. 'CLIENT', 'USEREVENT', 'SCRIPTLET', 'MAPREDUCE', 'SCHEDULED', 'SUITELET', 'RESTLET', 'WORKFLOWACTION', 'PORTLET', 'BUNDLEINSTALLATION', 'MASSUPDATESCRIPT'). Case-insensitive. Filters at the SQL level."
        },
        name: {
          type: "string",
          description: "Partial script name to search for (case-insensitive LIKE match). Filters at the SQL level."
        },
        owner: {
          type: "string",
          description: "Partial owner name to filter by (case-insensitive LIKE match). Filters at the SQL level."
        },
        search: {
          type: "string",
          description: "Fuzzy client-side keyword search across name, scriptid, owner, and scriptfile (case-insensitive). Applied AFTER server-side filters."
        }
      }
    }
  },
  {
    name: "netsuite_get_script_files",
    description:
      "Fetch the full source code for one or more scripts by their internal numeric IDs (the 'id' field from netsuite_get_scripts).",
    inputSchema: {
      type: "object",
      properties: {
        scriptIds: {
          type: "array",
          items: { type: "number" },
          description: "One or more script internal numeric IDs (e.g. [523] or [523, 841])."
        }
      },
      required: ["scriptIds"]
    }
  },
  {
    name: "netsuite_get_deployed_scripts",
    description:
      "Get all currently deployed scripts attached to a specific record type, including full source code for analysis. " +
      "Pass a record type ID from netsuite_list_record_types, such as 'salesorder', 'customer', 'itemfulfillment', or 'customrecord_my_type'. " +
      "Returns scriptName, scriptType, scriptId, internal numeric id, and scriptFile content for each deployed script.",
    inputSchema: {
      type: "object",
      properties: {
        recordType: {
          type: "string",
          description:
            "The NetSuite record type ID. Use netsuite_list_record_types first if you do not know the exact value."
        }
      },
      required: ["recordType"]
    }
  },
  {
    name: "netsuite_get_logs",
    description:
      "Get script execution logs from a live NetSuite account. Defaults to the last 7 days. Filter by scriptIds for targeted debugging. Focus on 'ERROR' and 'System' type logs for failures.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: {
          type: "string",
          description: "Start date ISO string. Defaults to 7 days ago."
        },
        endDate: {
          type: "string",
          description: "End date ISO string. Defaults to now."
        },
        scriptIds: {
          type: "array",
          items: { type: "number" },
          description: "Filter by script internal IDs."
        },
        type: {
          type: "string",
          description: "Log type filter: 'ERROR', 'DEBUG', 'AUDIT', 'EMERGENCY', or 'System'."
        }
      }
    }
  },
  // ── Record Tools ──
  // Workflow: show/view/get any record → netsuite_load_record (directly, no other steps needed)
  //           unsure of recordType string → netsuite_list_record_types first
  //           want to know what fields a type has → netsuite_get_record_fields
  {
    name: "netsuite_load_record",
    description:
      "ALWAYS use this tool when the user asks to 'show', 'view', 'display', 'get', or 'load' a NetSuite record by ID. " +
      "Returns body fields only (no sublist rows) — fast and token-efficient. " +
      "If the user also needs line items or sublist rows, call netsuite_get_record_sublists afterward. " +
      "Do NOT use SuiteQL as a substitute — this tool returns all body field values (value + display text) directly from the record API. " +
      "Common recordType values: 'script' (SuiteScript), 'scriptdeployment', 'customer', 'salesorder', 'invoice', 'purchaseorder', 'employee', 'vendor', 'item', 'customrecord_<scriptid>' for custom records. " +
      "If you are unsure of the correct recordType string, call netsuite_list_record_types first.",
    inputSchema: {
      type: "object",
      properties: {
        recordType: {
          type: "string",
          description: "The SuiteScript record type ID. Examples: 'script', 'scriptdeployment', 'customer', 'salesorder', 'invoice', 'purchaseorder', 'employee', 'vendor', 'customrecord_foo'. Call netsuite_list_record_types if unsure."
        },
        recordId: {
          type: "string",
          description: "The internal numeric ID of the record to load (e.g. '3309')."
        }
      },
      required: ["recordType", "recordId"]
    }
  },
  {
    name: "netsuite_get_record_sublists",
    description:
      "Get the sublist rows (line items) for a NetSuite record. " +
      "Use this after netsuite_load_record when the user specifically needs line-item data (e.g. order items, expense lines, inventory lines). " +
      "Do NOT call this unless sublists are explicitly needed — sublist data can be very large. " +
      "Specify sublistIds to limit which sublists are returned; omit to get all sublists. " +
      "Common sublists: 'item' (line items), 'expense' (expense lines), 'apply' (applied transactions), 'links' (related records).",
    inputSchema: {
      type: "object",
      properties: {
        recordType: {
          type: "string",
          description: "The SuiteScript record type ID (e.g. 'salesorder', 'invoice', 'purchaseorder')."
        },
        recordId: {
          type: "string",
          description: "The internal numeric ID of the record (e.g. '3309')."
        },
        sublistIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional: limit which sublists are returned (e.g. ['item', 'expense']). Omit to return all sublists — can be large on transactions."
        }
      },
      required: ["recordType", "recordId"]
    }
  },
  {
    name: "netsuite_list_record_types",
    description:
      "List ALL available NetSuite record types — both standard built-in types and custom record types in this account. Returns { name, id } pairs. " +
      "Use this ONLY when you need to discover the correct `recordType` string to pass to netsuite_load_record or netsuite_get_record_fields and you cannot infer it from context. " +
      "Most common types (no lookup needed): 'script', 'scriptdeployment', 'customer', 'salesorder', 'invoice', 'purchaseorder', 'employee', 'vendor', 'customrecord_<scriptid>'.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "netsuite_get_record_fields",
    description:
      "Get the list of available body fields and sublist fields for a record type, WITHOUT loading a real record. " +
      "Use this as a metadata/discovery tool when you need to know what fields a type exposes before querying or building logic around it. " +
      "You do NOT need to call this before netsuite_load_record — load_record already returns all fields.",
    inputSchema: {
      type: "object",
      properties: {
        recordType: {
          type: "string",
          description: "The record type ID (e.g. 'script', 'salesorder', 'customer', 'customrecord_foo')."
        }
      },
      required: ["recordType"]
    }
  },
  // ── Bundle Tools ──
  {
    name: "netsuite_list_bundles",
    description:
      "List SuiteApp bundles in the current NetSuite account. Returns each bundle's name, ID, version, app ID, abstract, creator, dates, and a `type` field ('installed' or 'created'). Use the `filter` parameter to narrow results: 'installed' returns only marketplace/3rd-party bundles, 'created' returns only bundles built and published in-house, 'all' (default) returns both.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["all", "installed", "created"],
          description:
            "'all' (default) – both installed and created bundles. 'installed' – only bundles downloaded from the SuiteApp marketplace (type=I). 'created' – only bundles built and published in-house (type=S)."
        }
      }
    }
  },
  {
    name: "netsuite_get_bundle_components",
    description:
      "Get the detailed list of components installed by a specific bundle, identified by its Bundle ID. Returns components grouped by category (e.g. 'Script Files', 'Custom Records') and subcategory, with each component's name, script/record ID, references, and lock status.",
    inputSchema: {
      type: "object",
      properties: {
        bundleId: {
          type: "string",
          description: "The numeric Bundle ID to inspect (e.g. '123456'). Obtain this from netsuite_list_bundles."
        },
        bundleName: {
          type: "string",
          description: "Optional bundle name for context."
        }
      },
      required: ["bundleId"]
    }
  },
  // ── File Cabinet Tools ──
  // Recommended workflow:
  //   1. netsuite_find_folder(name:"test") → get folder id
  //   2. netsuite_list_folder(folderId:"123") → see files + subfolders
  //   3. netsuite_find_file(name:"foo") → locate a specific file globally
  {
    name: "netsuite_find_folder",
    description:
      "Search the ENTIRE NetSuite File Cabinet for folders matching a name or ID. Searches globally (not just root). " +
      "Use this first when you don't know a folder's ID. " +
      "After finding the folder, call netsuite_list_folder with the returned id to see its contents. " +
      "Returns matching folders with id, name, and parent folder id.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Exact internal ID of the folder (e.g. '67890'). Use for direct lookup."
        },
        name: {
          type: "string",
          description: "Partial folder name to search for globally (case-insensitive). E.g. 'test to remove' will find any folder containing that text anywhere in the File Cabinet."
        }
      }
    }
  },
  {
    name: "netsuite_list_folder",
    description:
      "List the immediate contents of a File Cabinet folder — returns both files and subfolders in a single call. " +
      "Use this after netsuite_find_folder to explore a folder's contents. " +
      "Returns { folderId, subfolders: [{id, name}], files: [{id, name, filesize, filetype, url}] }.",
    inputSchema: {
      type: "object",
      properties: {
        folderId: {
          type: "string",
          description: "Internal ID of the folder to list (e.g. '12345'). Obtain from netsuite_find_folder."
        }
      },
      required: ["folderId"]
    }
  },
  {
    name: "netsuite_find_file",
    description:
      "Search the ENTIRE NetSuite File Cabinet for files matching a name or ID. Searches globally across all folders. " +
      "Returns matching files with id, name, folder (parent folder id), filesize, filetype, and url. " +
      "To read the actual content of a file after finding it, call netsuite_read_file with the file id.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Exact internal ID of the file (e.g. '12345'). Use for direct lookup."
        },
        name: {
          type: "string",
          description: "Partial file name to search globally (case-insensitive LIKE match). E.g. 'myScript' will match 'myScript.js' anywhere in the File Cabinet."
        }
      }
    }
  },
  {
    name: "netsuite_read_file",
    description:
      "Read the actual content of a NetSuite File Cabinet file by its internal ID. " +
      "ALWAYS use this tool when you have a file ID (e.g. from a SuiteQL query result or from netsuite_find_file) and the user wants to see or display the file contents. " +
      "Returns the file name, content type, and full text content (or base64 for binary files). " +
      "Works with any text-based file: .js, .json, .xml, .csv, .html, .ftl, .txt, etc.",
    inputSchema: {
      type: "object",
      properties: {
        fileId: {
          type: "string",
          description: "The internal numeric ID of the file to read (e.g. '21301'). Obtain this from a SuiteQL query or from netsuite_find_file."
        }
      },
      required: ["fileId"]
    }
  }
];

// -----------------------------
// MCP tool handling
// -----------------------------
async function handleRequest({ requestId, method, params }) {
  try {
    let result;

    if (method === "tools/list") {
      const storageResult = await chrome.storage.sync.get(["magic_netsuite_settings"]);
      const disabledTools = storageResult?.magic_netsuite_settings?.mcpDisabledTools ?? [];
      result = {
        tools: disabledTools.length > 0
          ? MCP_TOOL_DEFINITIONS.filter(t => !disabledTools.includes(t.name))
          : MCP_TOOL_DEFINITIONS
      };
    } else if (method === "tools/call") {
      const { name, arguments: args = {} } = params;

      // Reject calls to disabled tools before execution
      const storageForCall = await chrome.storage.sync.get(["magic_netsuite_settings"]);
      const disabledToolsForCall = storageForCall?.magic_netsuite_settings?.mcpDisabledTools ?? [];
      if (disabledToolsForCall.includes(name)) {
        throw new Error(`Tool "${name}" is disabled. Enable it in the MCP Server settings.`);
      }

      try {
        if (name === "ping") {
          // Include account info so agents can discover which account is targeted
          const storageForPing = await chrome.storage.sync.get(["magic_netsuite_settings"]);
          const pingAccount = storageForPing?.magic_netsuite_settings?.mcpPreferredAccount || null;
          const text = args.message ? `pong: ${args.message}` : "pong";
          const accountInfo = pingAccount ? ` (account: ${pingAccount})` : "";
          result = { content: [{ type: "text", text: text + accountInfo }] };
        } else if (name === "suiteql_get_guide") {
          result = { content: [{ type: "text", text: SUITEQL_GUIDE }] };
        } else if (name.startsWith("suiteql_")) {
          result = await handleSuiteQLTool(name, args);
        } else if (name === "netsuite_search_docs") {
          result = await handleNetsuiteSearchDocs(args);
        } else if (name === "netsuite_read_doc_page") {
          result = await handleNetsuiteReadDocPage(args);
        } else if (name === "netsuite_list_bundles") {
          result = await handleNetsuitListBundles(args);
        } else if (name === "netsuite_get_bundle_components") {
          result = await handleNetsuiteGetBundleComponents(args);
        } else if (name === "netsuite_list_record_types") {
          result = await handleNetsuiteListRecordTypes();
        } else if (name === "netsuite_load_record") {
          result = await handleNetsuiteLoadRecord(args);
        } else if (name === "netsuite_get_record_sublists") {
          result = await handleNetsuiteGetRecordSublists(args);
        } else if (name === "netsuite_get_record_fields") {
          result = await handleNetsuiteGetRecordFields(args);
        } else if (name === "netsuite_read_file") {
          result = await handleNetsuiteReadFile(args);
        } else if (name === "netsuite_find_file") {
          result = await handleNetsuiteFindFile(args);
        } else if (name === "netsuite_find_folder") {
          result = await handleNetsuiteFindFolder(args);
        } else if (name === "netsuite_list_folder") {
          result = await handleNetsuiteListFolder(args);
        } else if (name === "netsuite_get_scripts") {
          result = await handleNetsuiteGetScripts(args);
        } else if (name === "netsuite_get_script_files") {
          result = await handleNetsuiteGetScriptFiles(args);
        } else if (name === "netsuite_get_deployed_scripts") {
          result = await handleNetsuiteGetDeployedScripts(args);
        } else if (name === "netsuite_get_logs") {
          result = await handleNetsuiteGetLogs(args);
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
        recordMcpUsage(name, true, null);

        // After a successful tool call, check governance on the dedicated tab
        // and refresh it if needed for the next call.
        // Fire-and-forget — don't block the response.
        checkAndRefreshDedicatedTabGovernance().catch((err) => {
          console.debug(`[MCP] Post-call governance check failed: ${err.message}`);
        });
      } catch (toolErr) {
        recordMcpUsage(name, false, toolErr.message);
        throw toolErr;
      }
    } else {
      throw new Error(`Unknown method: ${method}`);
    }

    return { requestId, success: true, result, account: mcpDedicatedTabAccountId || null };
  } catch (err) {
    // Handle non-Error throws (plain objects, strings) that have no .message
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "string"
        ? err
        : JSON.stringify(err);
    return { requestId, success: false, error: msg };
  }
}

// -----------------------------
// SuiteQL Tool Handler
// -----------------------------
async function handleSuiteQLTool(toolName, args) {
  const actionMap = {
    "suiteql_search_tables": "FETCH_SUITEQL_TABLES",
    "suiteql_get_table_fields": "FETCH_SUITEQL_TABLE_DETAIL",
    "suiteql_get_table_joins": "FETCH_SUITEQL_TABLE_DETAIL",
    "suiteql_execute_query": "RUN_SUITEQL_QUERY",
    "suiteql_discover_field_values": "RUN_SUITEQL_QUERY"
  };

  const action = actionMap[toolName];
  if (!action) {
    throw new Error(`Unknown SuiteQL tool: ${toolName}`);
  }

  // Get preferred NetSuite tab (account-aware for MCP)
  const tab = await getPreferredNetsuiteTab();
  if (!tab) {
    throw new Error("No suitable NetSuite tab found");
  }

  // Prepare payload based on tool
  let payload = {};
  if (toolName === "suiteql_search_tables") {
    // No specific payload needed, the API returns all tables and we filter
  } else if (toolName === "suiteql_get_table_fields" || toolName === "suiteql_get_table_joins") {
    payload = { tableName: args.tableName };
  } else if (toolName === "suiteql_execute_query") {
    // Guard: LIMIT is not valid SuiteQL syntax (Oracle SQL uses ROWNUM)
    if (/\bLIMIT\b/i.test(args.sql)) {
      throw new Error(
        "LIMIT is not valid SuiteQL syntax and will cause an error. " +
        "Use ROWNUM in a WHERE clause instead. " +
        "Example: SELECT id, name FROM customer WHERE ROWNUM <= 10"
      );
    }
    payload = { sql: args.sql };
  } else if (toolName === "suiteql_discover_field_values") {
    const sql = `SELECT DISTINCT ${args.fieldId} FROM ${args.tableName} WHERE ${args.fieldId} IS NOT NULL AND ROWNUM <= 20`;
    payload = { sql, limit: 20 };
  }

  // Send message to content script
  const response = await sendMessageToTab(tab.id, {
    action,
    data: payload,
    mode: "normal"
  });

  if (!response || response.status === "error") {
    // response.message can be an object (e.g. a NetSuite error payload) — serialize it
    const rawMsg = response?.message;
    const errMsg =
      rawMsg
        ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg))
        : "Failed to execute SuiteQL tool";
    throw new Error(errMsg);
  }

  // Process response based on tool
  let resultData = response.message;

  if (toolName === "suiteql_search_tables") {
    const data = resultData?.data ?? (Array.isArray(resultData) ? resultData : []);
    const query = (args.query || "").toLowerCase();
    const filtered = query
      ? data.filter(t =>
          t.id.toLowerCase().includes(query) ||
          t.label.toLowerCase().includes(query)
        )
      : data;

    resultData = {
      total: data.length,
      matched: filtered.length,
      tables: filtered.slice(0, 50)
    };
  } else if (toolName === "suiteql_get_table_fields") {
    const data = resultData?.data ?? resultData ?? {};
    const fields = (data.fields ?? [])
      .filter(f => f.isColumn)
      .map(f => ({
        id: f.id,
        label: f.label,
        dataType: f.dataType
      }));

    resultData = {
      table: args.tableName,
      fieldCount: fields.length,
      fields
    };
  } else if (toolName === "suiteql_get_table_joins") {
    const data = resultData?.data ?? resultData ?? {};
    const joins = (data.joins ?? []).map(j => ({
      id: j.id,
      label: j.label,
      joinType: j.joinType,
      cardinality: j.cardinality,
      targetTable: j.sourceTargetType?.id ?? null,
      joinCondition: j.sourceTargetType?.joinPairs?.[0]?.label ?? null
    }));

    resultData = {
      table: args.tableName,
      joinCount: joins.length,
      joins
    };
  } else if (toolName === "suiteql_execute_query") {
    const payload = resultData?.results ?? resultData ?? [];
    const results = Array.isArray(payload) ? payload : (payload.results ?? []);
    const totalCount = Array.isArray(payload)
      ? results.length
      : (payload.totalCount ?? results.length);
    const columns = results.length > 0 ? Object.keys(results[0]) : [];

    resultData = {
      success: true,
      columns,
      rowCount: results.length,
      totalCount,
      results,
      note: totalCount > 5
        ? `Showing 5 of ${totalCount} total rows (preview mode).`
        : undefined
    };
  } else if (toolName === "suiteql_discover_field_values") {
    const payload = resultData?.results ?? resultData ?? [];
    const results = Array.isArray(payload) ? payload : (payload.results ?? []);
    const values = results
      .map(r => r[args.fieldId] ?? Object.values(r)[0])
      .filter(v => v !== null && v !== undefined && v !== "");

    resultData = {
      success: true,
      table: args.tableName,
      field: args.fieldId,
      sampleCount: values.length,
      distinctValues: values
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify(resultData, null, 2)
    }]
  };
}

// -----------------------------
// NetSuite Docs Tool Helpers
// -----------------------------

async function handleNetsuiteSearchDocs(args) {
  const tab = await getPreferredNetsuiteTab();
  if (!tab || !tab.url) {
    throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");
  }

  const { protocol, host } = new URL(tab.url);
  const baseUrl = `${protocol}//${host}`;
  const searchUrl = `${baseUrl}/app/help/helpcenter.nl?search=${encodeURIComponent(String(args.query ?? ""))}`;

  const response = await sendMessageToTab(tab.id, {
    action: "FETCH_HELP_PAGE",
    data: { url: searchUrl, operation: "search", baseUrl },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    throw new Error(response?.message ?? "Failed to fetch NetSuite docs");
  }

  const results = response.message?.results ?? [];
  const payload = results.length === 0
    ? { results: [], message: "No results found for the given query." }
    : { results };

  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

async function handleNetsuiteReadDocPage(args) {
  const url = String(args.url ?? "");
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("url must be a valid NetSuite help page URL.");
  }

  const isNetsuiteHost = parsedUrl.hostname === "netsuite.com" || parsedUrl.hostname.endsWith(".netsuite.com");
  const isHelpCenterPage = parsedUrl.pathname === "/app/help/helpcenter.nl";
  if (!isNetsuiteHost || !isHelpCenterPage) {
    throw new Error("URL must point to a NetSuite help center page.");
  }

  const tab = await getPreferredNetsuiteTab();
  if (!tab) {
    throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");
  }

  const response = await sendMessageToTab(tab.id, {
    action: "FETCH_HELP_PAGE",
    data: { url, operation: "read" },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    throw new Error(response?.message ?? "Failed to fetch doc page");
  }

  const content = response.message?.content ?? "";
  if (!content) throw new Error("Could not parse content from the page.");

  const links = Array.isArray(response.message?.links) ? response.message.links : [];
  const payload = {
    url,
    ...(response.message?.title ? { title: response.message.title } : {}),
    content: content.slice(0, 10_000),
    contentLength: content.length,
    contentTruncated: content.length > 10_000,
    links,
    linkCount: response.message?.linkCount ?? links.length,
    linksTruncated: Boolean(response.message?.linksTruncated)
  };

  return {
    content: [{
      type: "text",
      text: JSON.stringify(payload, null, 2)
    }]
  };
}

// -----------------------------
// Bundle Tool Helpers
// -----------------------------

async function handleNetsuitListBundles(args) {
  const tab = await getPreferredNetsuiteTab();
  if (!tab || !tab.url) {
    throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");
  }

  const { hostname } = new URL(tab.url);

  // Map friendly filter names to NetSuite type codes
  const filterMap = { installed: "I", created: "S", all: "both" };
  const bundleType = filterMap[args?.filter] ?? "both";

  const response = await sendMessageToTab(tab.id, {
    action: "FETCH_BUNDLES",
    data: { domain: hostname, bundleType },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    throw new Error(response?.message ?? "Failed to fetch bundle list");
  }

  const bundles = response.message?.bundles ?? [];
  const installed = bundles.filter(b => b.type === "installed").length;
  const created = bundles.filter(b => b.type === "created").length;
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ bundles, count: bundles.length, installed, created }, null, 2)
    }]
  };
}

async function handleNetsuiteGetBundleComponents(args) {
  const bundleId = String(args.bundleId ?? "");
  if (!bundleId) throw new Error("bundleId is required.");

  const tab = await getPreferredNetsuiteTab();
  if (!tab || !tab.url) {
    throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");
  }

  const { hostname } = new URL(tab.url);

  const response = await sendMessageToTab(tab.id, {
    action: "FETCH_BUNDLE_COMPONENTS",
    data: { domain: hostname, bundleId },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    throw new Error(response?.message ?? `Failed to fetch components for bundle ${bundleId}`);
  }

  const components = response.message?.components ?? [];
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ bundleId, components, count: components.length }, null, 2)
    }]
  };
}

// -----------------------------
// Record Tool Helpers
// -----------------------------

async function handleNetsuiteLoadRecord(args) {
  const recordType = String(args.recordType ?? "");
  const recordId = String(args.recordId ?? "");
  if (!recordType) throw new Error("recordType is required.");
  if (!recordId) throw new Error("recordId is required.");

  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  const response = await sendMessageToTab(tab.id, {
    action: "LOAD_RECORD",
    data: { type: recordType, id: recordId },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    const rawMsg = response?.message;
    const errMsg = rawMsg
      ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg))
      : `Failed to load record ${recordType}/${recordId}`;
    throw new Error(errMsg);
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify(response.message, null, 2)
    }]
  };
}

async function handleNetsuiteGetRecordSublists(args) {
  const recordType = String(args.recordType ?? "");
  const recordId = String(args.recordId ?? "");
  if (!recordType) throw new Error("recordType is required.");
  if (!recordId) throw new Error("recordId is required.");

  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  const response = await sendMessageToTab(tab.id, {
    action: "LOAD_RECORD_SUBLISTS",
    data: { type: recordType, id: recordId, sublistIds: args.sublistIds ?? null },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    const rawMsg = response?.message;
    const errMsg = rawMsg
      ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg))
      : `Failed to load sublists for record ${recordType}/${recordId}`;
    throw new Error(errMsg);
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify(response.message, null, 2)
    }]
  };
}

async function handleNetsuiteGetRecordFields(args) {
  const recordType = String(args.recordType ?? "");
  if (!recordType) throw new Error("recordType is required.");

  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  const response = await sendMessageToTab(tab.id, {
    action: "GET_RECORD_FIELDS",
    data: { type: recordType },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    const rawMsg = response?.message;
    const errMsg = rawMsg
      ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg))
      : `Failed to get fields for record type ${recordType}`;
    throw new Error(errMsg);
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify(response.message, null, 2)
    }]
  };
}

async function handleNetsuiteListRecordTypes() {
  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  const response = await sendMessageToTab(tab.id, {
    action: "GET_ALL_RECORD_TYPES",
    data: {},
    mode: "normal"
  });

  if (!response || response.status === "error") {
    const rawMsg = response?.message;
    const errMsg = rawMsg
      ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg))
      : "Failed to get record types";
    throw new Error(errMsg);
  }

  const records = response.message ?? [];
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ count: records.length, recordTypes: records }, null, 2)
    }]
  };
}

async function handleNetsuiteFindFile(args) {
  const { id, name } = args ?? {};
  if (!id && !name) throw new Error("At least one of 'id' or 'name' is required.");

  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  const conditions = [];
  if (id) conditions.push(`id = ${parseInt(id, 10)}`);
  if (name) conditions.push(`LOWER(name) LIKE LOWER('%${String(name).replace(/'/g, "''")}%')`);
  const whereClause = conditions.length === 1 ? conditions[0] : `(${conditions.join(" OR ")})`;
  const sql = `SELECT id, name, folder, filesize, filetype, url FROM file WHERE ${whereClause} AND ROWNUM <= 25`;

  const response = await sendMessageToTab(tab.id, {
    action: "RUN_SUITEQL_QUERY",
    data: { sql, limit: 25 },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    const rawMsg = response?.message;
    const errMsg = rawMsg
      ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg))
      : "Failed to find files";
    throw new Error(errMsg);
  }

  const files = response.message ?? [];
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ count: files.length, files }, null, 2)
    }]
  };
}

async function handleNetsuiteFindFolder(args) {
  const { id, name } = args ?? {};
  if (!id && !name) throw new Error("At least one of 'id' or 'name' is required.");

  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  const conditions = [];
  if (id) conditions.push(`id = ${parseInt(id, 10)}`);
  if (name) conditions.push(`LOWER(name) LIKE LOWER('%${String(name).replace(/'/g, "''")}%')`);
  const whereClause = conditions.length === 1 ? conditions[0] : `(${conditions.join(" OR ")})`;
  const sql = `SELECT id, name, parent FROM MediaItemFolder WHERE ${whereClause} AND ROWNUM <= 25`;

  const response = await sendMessageToTab(tab.id, {
    action: "RUN_SUITEQL_QUERY",
    data: { sql, limit: 25 },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    const rawMsg = response?.message;
    const errMsg = rawMsg
      ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg))
      : "Failed to find folders";
    throw new Error(errMsg);
  }

  const folders = response.message ?? [];
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ count: folders.length, folders }, null, 2)
    }]
  };
}

async function handleNetsuiteListFolder(args) {
  const folderId = String(args?.folderId ?? "").trim();
  if (!folderId) throw new Error("folderId is required.");
  const idNum = parseInt(folderId, 10);
  if (isNaN(idNum)) throw new Error("folderId must be a numeric folder ID.");

  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  // Run both queries in parallel
  const [subfoldersResp, filesResp] = await Promise.all([
    sendMessageToTab(tab.id, {
      action: "RUN_SUITEQL_QUERY",
      data: { sql: `SELECT id, name FROM MediaItemFolder WHERE parent = ${idNum} AND ROWNUM <= 200`, limit: 200 },
      mode: "normal"
    }),
    sendMessageToTab(tab.id, {
      action: "RUN_SUITEQL_QUERY",
      data: { sql: `SELECT id, name, filesize, filetype, url FROM file WHERE folder = ${idNum} AND ROWNUM <= 200`, limit: 200 },
      mode: "normal"
    })
  ]);

  if (!subfoldersResp || subfoldersResp.status === "error") {
    const msg = subfoldersResp?.message;
    throw new Error(msg ? (typeof msg === "string" ? msg : JSON.stringify(msg)) : "Failed to list subfolders");
  }
  if (!filesResp || filesResp.status === "error") {
    const msg = filesResp?.message;
    throw new Error(msg ? (typeof msg === "string" ? msg : JSON.stringify(msg)) : "Failed to list files");
  }

  const subfolders = subfoldersResp.message ?? [];
  const files = filesResp.message ?? [];

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        folderId: idNum,
        subfolderCount: subfolders.length,
        fileCount: files.length,
        subfolders,
        files
      }, null, 2)
    }]
  };
}

async function handleNetsuiteReadFile(args) {
  const fileId = String(args?.fileId ?? "").trim();
  if (!fileId) throw new Error("fileId is required.");
  const idNum = parseInt(fileId, 10);
  if (isNaN(idNum)) throw new Error("fileId must be a numeric file ID.");

  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  // Step 1: Resolve the file URL via SuiteQL
  const urlResp = await sendMessageToTab(tab.id, {
    action: "RUN_SUITEQL_QUERY",
    data: { sql: `SELECT id, name, url, filetype, filesize FROM file WHERE id = ${idNum} AND ROWNUM <= 1`, limit: 1 },
    mode: "normal"
  });

  if (!urlResp || urlResp.status === "error") {
    const msg = urlResp?.message;
    throw new Error(msg ? (typeof msg === "string" ? msg : JSON.stringify(msg)) : `Failed to look up file ${fileId}`);
  }

  const rows = urlResp.message ?? [];
  const fileRow = Array.isArray(rows) ? rows[0] : (rows?.results?.[0] ?? null);
  if (!fileRow) throw new Error(`File with ID ${fileId} not found in the File Cabinet.`);

  const { name: fileName, url: fileUrl, filetype, filesize } = fileRow;
  if (!fileUrl) throw new Error(`File ${fileId} exists but has no accessible URL.`);

  // Step 2: Fetch the actual file content
  const contentResp = await sendMessageToTab(tab.id, {
    action: "FETCH_FILE_CONTENT",
    data: { fileUrl },
    mode: "normal"
  });

  if (!contentResp || contentResp.status === "error") {
    const msg = contentResp?.message;
    throw new Error(msg ? (typeof msg === "string" ? msg : JSON.stringify(msg)) : `Failed to fetch content of file ${fileId}`);
  }

  const { content, contentType, binary } = contentResp.message ?? {};

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        fileId: idNum,
        fileName,
        filetype,
        filesize,
        contentType,
        binary: binary ?? false,
        content: content ?? ""
      }, null, 2)
    }]
  };
}

// -----------------------------
// Script Tool Helpers (MCP bridge)
// -----------------------------

async function handleNetsuiteGetScripts(args) {
  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  const response = await sendMessageToTab(tab.id, {
    action: "SCRIPTS",
    data: {
      scriptId: args.scriptId,
      scriptType: args.scriptType,
      name: args.name,
      owner: args.owner
    },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    const rawMsg = response?.message;
    throw new Error(rawMsg ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg)) : "Failed to fetch scripts");
  }

  let results = response.message;
  if (args.search && !args.scriptId && Array.isArray(results)) {
    const term = String(args.search).toLowerCase();
    results = results.filter(s =>
      String(s.name ?? "").toLowerCase().includes(term) ||
      String(s.scriptid ?? "").toLowerCase().includes(term) ||
      String(s.owner ?? "").toLowerCase().includes(term) ||
      String(s.scriptfile ?? "").toLowerCase().includes(term)
    );
  }

  return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
}

async function handleNetsuiteGetScriptFiles(args) {
  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  const response = await sendMessageToTab(tab.id, {
    action: "SCRIPT_FILES",
    data: { scriptIds: args.scriptIds },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    const rawMsg = response?.message;
    throw new Error(rawMsg ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg)) : "Failed to fetch script files");
  }

  return { content: [{ type: "text", text: JSON.stringify(response.message, null, 2) }] };
}

async function handleNetsuiteGetDeployedScripts(args) {
  const recordType = String(args.recordType ?? "").trim();
  if (!recordType) throw new Error("recordType is required.");

  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  const response = await sendMessageToTab(tab.id, {
    action: "SCRIPTS_DEPLOYED",
    data: { recordType },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    const rawMsg = response?.message;
    throw new Error(rawMsg ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg)) : `Failed to fetch deployed scripts for ${recordType}`);
  }

  const scripts = Array.isArray(response.message) ? response.message : [];
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ recordType, count: scripts.length, scripts }, null, 2)
    }]
  };
}

async function handleNetsuiteGetLogs(args) {
  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  const normalizeNumericIds = (value) => {
    if (!Array.isArray(value)) return [];
    return value.map(v => Number(v)).filter(v => Number.isInteger(v) && v > 0);
  };

  const now = new Date();
  const defaultStartDate = new Date(now);
  defaultStartDate.setDate(defaultStartDate.getDate() - 7);
  defaultStartDate.setHours(0, 0, 0, 0);

  const payload = {
    startDate: args.startDate || defaultStartDate.toISOString(),
    endDate: args.endDate || now.toISOString(),
    scriptIds: normalizeNumericIds(args.scriptIds),
    deploymentIds: normalizeNumericIds(args.deploymentIds),
    scriptTypes: args.scriptTypes || [],
    type: args.type
  };

  const response = await sendMessageToTab(tab.id, {
    action: "LOGS",
    data: payload,
    mode: "normal"
  });

  if (!response || response.status === "error") {
    const rawMsg = response?.message;
    throw new Error(rawMsg ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg)) : "Failed to fetch logs");
  }

  let results = response.message;
  if (Array.isArray(results) && results.length > 50) {
    const total = results.length;
    results = results.slice(0, 50);
    results.push({ _note: `Showing 50 of ${total} logs. Narrow your date range or add type filter for more specific results.` });
  }

  return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
}

// -----------------------------
// Tab Helpers
// -----------------------------

/**
 * Extracts the NetSuite account ID from a tab URL.
 * E.g., "https://9937091-sb1.app.netsuite.com/..." -> "9937091_SB1"
 * The subdomain portion is uppercased and hyphens are replaced with underscores.
 */
function extractAccountIdFromUrl(url) {
  try {
    const hostname = new URL(url).hostname; // e.g. "9937091-sb1.app.netsuite.com"
    const parts = hostname.split(".");
    if (parts.length < 3) return null;
    const subdomain = parts[0]; // e.g. "9937091-sb1"
    return subdomain.toUpperCase().replace(/-/g, "_"); // e.g. "9937091_SB1"
  } catch {
    return null;
  }
}

/**
 * Discovers all NetSuite tabs with app.netsuite.com, checks which ones have
 * the content script connected (CHECK_CONNECTION), and returns the first tab
 * that matches the preferred account from settings.
 *
 * For MCP calls, this function also manages the dedicated governance tab:
 *  1. If a dedicated tab exists and matches the preferred account, check its
 *     governance and refresh it if needed.
 *  2. If the selected tab has low governance, create a dedicated tab.
 *
 * Fallback behavior:
 *  - If no preferredAccount is set -> falls back to active tab (legacy behavior)
 *  - If preferredAccount is set but no matching connected tab -> tries dedicated tab
 */
async function getPreferredNetsuiteTab() {
  // Read preferred account from settings
  const storageResult = await chrome.storage.sync.get(["magic_netsuite_settings"]);
  const preferredAccount = storageResult?.magic_netsuite_settings?.mcpPreferredAccount || "";

  // If no preference is set, fall back to the active tab (legacy behavior)
  if (!preferredAccount) {
    return getActiveNetsuiteTab();
  }

  // ── Step 1: Check if we have a valid dedicated tab for this account ──
  if (mcpDedicatedTabId && mcpDedicatedTabAccountId === preferredAccount) {
    const dedicatedTab = await validateDedicatedTab();
    if (dedicatedTab) {
      // Check governance and refresh if low
      const remaining = await checkTabGovernance(dedicatedTab.id);
      if (remaining !== -1 && remaining < MCP_GOVERNANCE_THRESHOLD) {
        console.log(`[MCP] Dedicated tab governance low (${remaining}), refreshing...`);
        await refreshDedicatedTab();
      }
      return dedicatedTab;
    }
    // Dedicated tab is invalid — clear and fall through to find another
  }

  // ── Step 2: Find any existing connected tab for this account ──
  const allTabs = await chrome.tabs.query({});
  const netsuiteTabs = allTabs.filter(
    (tab) => tab.url && tab.url.includes("app.netsuite.com") && tab.id
  );

  if (netsuiteTabs.length === 0) {
    // No NetSuite tabs at all — create a dedicated tab
    console.log(`[MCP] No NetSuite tabs found, creating dedicated tab for ${preferredAccount}`);
    const domain = getAccountDomain(preferredAccount);
    const newTab = await createMcpDedicatedTab(domain);
    return newTab;
  }

  // Check connection status for each NS tab in parallel
  const connectionChecks = netsuiteTabs.map(async (tab) => {
    try {
      const response = await sendMessageToTab(tab.id, {
        action: "CHECK_CONNECTION",
        data: {},
        mode: "normal"
      });
      return {
        tab,
        connected: response?.message === "connected",
        accountId: extractAccountIdFromUrl(tab.url)
      };
    } catch {
      return { tab, connected: false, accountId: null };
    }
  });

  const results = await Promise.all(connectionChecks);
  const connectedTabs = results.filter((r) => r.connected);

  if (connectedTabs.length === 0) {
    // No connected tabs — create a dedicated tab
    console.log(`[MCP] No connected NetSuite tabs, creating dedicated tab for ${preferredAccount}`);
    const domain = getAccountDomain(preferredAccount);
    const newTab = await createMcpDedicatedTab(domain);
    return newTab;
  }

  // Find a tab matching the preferred account
  const matchingTab = connectedTabs.find((r) => r.accountId === preferredAccount);

  if (!matchingTab) {
    // No matching tab — create a dedicated tab for the preferred account
    console.log(
      `[MCP] No tab for account "${preferredAccount}", creating dedicated tab. ` +
      `Available: ${connectedTabs.map((r) => r.accountId).filter(Boolean).join(", ")}`
    );
    const domain = getAccountDomain(preferredAccount);
    const newTab = await createMcpDedicatedTab(domain);
    return newTab;
  }

  // ── Step 3: Check governance on the matching tab ──
  const remaining = await checkTabGovernance(matchingTab.tab.id);
  if (remaining !== -1 && remaining < MCP_GOVERNANCE_THRESHOLD) {
    console.log(
      `[MCP] Tab ${matchingTab.tab.id} governance low (${remaining} remaining), ` +
      `creating dedicated tab for ${preferredAccount}`
    );
    const domain = getAccountDomain(preferredAccount);
    const newTab = await createMcpDedicatedTab(domain);
    return newTab;
  }

  return matchingTab.tab;
}

function getActiveNetsuiteTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id || !tab.url?.includes("app.netsuite.com")) {
        reject(new Error("No active NetSuite tab"));
        return;
      }
      resolve(tab);
    });
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}
