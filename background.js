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
    MCP_USAGE_CLEAR: handleMcpUsageClear
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
    sendResponse({ status: connections.size > 0 ? "connected" : "disconnected" });
  });
  return true; // async
};

const handleMcpDisconnect = ({ sendResponse }) => {
  mcpDisconnect();
  sendResponse({ status: "disconnected" });
  return true;
};

const handleMcpStatus = ({ sendResponse }) => {
  const isConnected = [...connections.values()].some(
    (s) => s.readyState === WebSocket.OPEN
  );
  sendResponse({ status: isConnected ? "connected" : "disconnected" });
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
// Connects to ALL magiNetsuiteMCPServer.js instances across ports 9700–9720 simultaneously,
// so multiple AI harnesses can each have their own MCP server and all receive
// extension responses in parallel.
const PORT_RANGE_START = 9700;
const PORT_RANGE_END = 9720;
const MCP_RECONNECT_ALARM = "mcp-reconnect";

// Map of port → WebSocket for every active magiNetsuiteMCPServer.js connection.
// Replacing the old single `ws` variable is the core fix: previously only
// the first port found was connected, leaving any additional host instances
// without an extension socket and causing "Extension not connected" errors.
const connections = new Map();
let isRefreshing = false;

// -----------------------------
// Entry point: check settings and connect if enabled
// -----------------------------
(async () => {
  const mcpEnabled = await isMcpEnabled();
  if (mcpEnabled) {
    mcpConnect();
  }
})();

// Alarm-based refresh: reconnects dropped sockets AND discovers new host
// instances that started after the extension was already connected.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === MCP_RECONNECT_ALARM) {
    console.log("[MCP Bridge] Alarm-based connection refresh");
    const enabled = await isMcpEnabled();
    if (enabled) {
      // await is intentional: keeps the service worker alive for the full
      // 2-second connection attempt window so ports with new host instances
      // are not missed due to early SW termination.
      await refreshConnections();
    } else {
      mcpDisconnect();
    }
  }
});

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
  await chrome.alarms.clear(MCP_RECONNECT_ALARM);

  await refreshConnections();

  // Keep alarm running permanently while enabled:
  // it both reconnects dropped sockets and discovers newly-started host instances.
  // 5-second interval (periodInMinutes: 0.083) ensures a newly-started host on
  // port 9701+ is discovered quickly instead of waiting up to 30 seconds.
  chrome.alarms.create(MCP_RECONNECT_ALARM, { periodInMinutes: 0.083 });
}

async function mcpDisconnect() {
  // Await the clear so the alarm cannot fire one final time due to a race
  await chrome.alarms.clear(MCP_RECONNECT_ALARM);

  for (const [, sock] of connections) {
    try { sock.close(); } catch {}
  }
  connections.clear();
  isRefreshing = false;
  console.log("[MCP Bridge] Manually disconnected");
}

// -----------------------------
// Connection refresh — connects to every listening port in parallel
// -----------------------------
async function refreshConnections() {
  if (isRefreshing) return;
  isRefreshing = true;

  const portsScanned = [];
  const portsSkipped = [];
  const portsConnected = [];

  const promises = [];
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    const existing = connections.get(port);
    if (existing && existing.readyState === WebSocket.OPEN) {
      portsSkipped.push(port);
      continue;
    }
    // Clean up stale entry if socket is no longer open
    if (existing) connections.delete(port);
    portsScanned.push(port);
    promises.push(
      tryConnect(port).then((connected) => {
        if (connected) portsConnected.push(port);
      })
    );
  }

  await Promise.all(promises);

  console.log(
    `[MCP Bridge] Scan complete — ` +
    `skipped(already open): [${portsSkipped}], ` +
    `scanned: ${portsScanned.length}, ` +
    `new: [${portsConnected}], ` +
    `total active: ${connections.size} (ports: ${[...connections.keys()].join(", ") || "none"})`
  );

  isRefreshing = false;
}

// -----------------------------
// Try single port — adds to connections Map on success, returns true/false
// -----------------------------
function tryConnect(port) {
  return new Promise((resolve) => {
    const url = `ws://127.0.0.1:${port}`;
    const sock = new WebSocket(url);

    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      // A timeout (rather than immediate refusal) means the port accepted
      // the TCP connection but never completed the WebSocket handshake.
      // Use debug level so it doesn't pollute the DevTools console by default.
      console.debug(`[MCP Bridge] port ${port} WebSocket handshake timed out`);
      try { sock.close(); } catch {}
      resolve(false);
    }, 2000);

    sock.onopen = () => {
      if (settled) return;
      settled = true;

      clearTimeout(timeout);
      console.debug(`[MCP Bridge] connected on port ${port}`);

      connections.set(port, sock);
      attachHandlers(sock, port);

      resolve(true);
    };

    sock.onerror = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      // Typically "connection refused" — nothing listening on this port.
      // Only log at debug level to keep noise down.
      // console.debug(`[MCP Bridge] port ${port} refused`);
      resolve(false);
    };

    sock.onclose = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(false);
    };
  });
}

// -----------------------------
// Message handling
// -----------------------------
function attachHandlers(sock, port) {
  sock.onmessage = async (event) => {
    let msg;

    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    console.debug("[MCP Bridge] ←", msg);

    const response = await handleRequest(msg);

    console.debug("[MCP Bridge] →", response);

    sock.send(JSON.stringify(response));
  };

  sock.onclose = () => {
    console.warn(`[MCP Bridge] disconnected from port ${port}`);
    connections.delete(port);
    // The alarm will reconnect and discover new hosts — no manual reschedule needed.
  };

  sock.onerror = (err) => {
    console.error(`[MCP Bridge] error on port ${port}`, err);
  };
}

// -----------------------------
// MCP tool handling
// -----------------------------
async function handleRequest({ requestId, method, params }) {
  try {
    let result;

    if (method === "tools/list") {
      result = {
        tools: [
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
          }
        ]
      };
    } else if (method === "tools/call") {
      const { name, arguments: args = {} } = params;

      try {
        if (name === "ping") {
          const text = args.message ? `pong: ${args.message}` : "pong";
          result = { content: [{ type: "text", text }] };
        } else if (name === "suiteql_get_guide") {
          result = { content: [{ type: "text", text: SUITEQL_GUIDE }] };
        } else if (name.startsWith("suiteql_")) {
          result = await handleSuiteQLTool(name, args);
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
        recordMcpUsage(name, true, null);
      } catch (toolErr) {
        recordMcpUsage(name, false, toolErr.message);
        throw toolErr;
      }
    } else {
      throw new Error(`Unknown method: ${method}`);
    }

    return { requestId, success: true, result };
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
 * Fallback behavior:
 *  - If no preferredAccount is set -> falls back to active tab (legacy behavior)
 *  - If preferredAccount is set but no matching connected tab -> throws error
 */
async function getPreferredNetsuiteTab() {
  // Read preferred account from settings
  const storageResult = await chrome.storage.sync.get(["magic_netsuite_settings"]);
  const preferredAccount = storageResult?.magic_netsuite_settings?.mcpPreferredAccount || "";

  // If no preference is set, fall back to the active tab (legacy behavior)
  if (!preferredAccount) {
    return getActiveNetsuiteTab();
  }

  // Query ALL tabs (not just active)
  const allTabs = await chrome.tabs.query({});
  const netsuiteTabs = allTabs.filter(
    (tab) => tab.url && tab.url.includes("app.netsuite.com") && tab.id
  );

  if (netsuiteTabs.length === 0) {
    throw new Error("No NetSuite tabs found in any window");
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
    throw new Error(
      "No connected NetSuite tabs found. Open a NetSuite page and ensure the extension is loaded."
    );
  }

  // Find the first tab whose account ID matches the preferred account
  const matchingTab = connectedTabs.find((r) => r.accountId === preferredAccount);

  if (!matchingTab) {
    const availableAccounts = connectedTabs
      .map((r) => r.accountId)
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `No connected tab found for account "${preferredAccount}". Available connected accounts: ${availableAccounts || "none detected"}`
    );
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
