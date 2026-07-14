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
const DASHBOARD_PREVIEW_SESSIONS_KEY = "magic_netsuite_dashboard_preview_sessions";
const dashboardEnablerReadyWaiters = new Map();
const readyDashboardEnablers = new Set();
let dashboardPreviewOpenPromise = null;
const DASHBOARD_TAB_TITLE = "Magic NetSuite";
const DASHBOARD_ENABLER_TAB_TITLE = "Magic NetSuite · NetSuite Worker";
const DASHBOARD_GROUP_TITLE = "Magic NetSuite";
const TAB_GROUP_ID_NONE = chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1;

const chromeCallback = (invoke) =>
  new Promise((resolve, reject) => {
    invoke((result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result);
    });
  });

const dashboardTabsQuery = (queryInfo) =>
  chromeCallback((done) => chrome.tabs.query(queryInfo, done));
const dashboardTabsGet = (tabId) =>
  chromeCallback((done) => chrome.tabs.get(tabId, done));
const dashboardTabsCreate = (createProperties) =>
  chromeCallback((done) => chrome.tabs.create(createProperties, done));
const dashboardTabsUpdate = (tabId, updateProperties) =>
  chromeCallback((done) =>
    chrome.tabs.update(tabId, updateProperties, done)
  );
const dashboardTabsRemove = (tabIds) =>
  chromeCallback((done) => chrome.tabs.remove(tabIds, () => done()));
const dashboardTabsGroup = (options) =>
  chromeCallback((done) => chrome.tabs.group(options, done));
const dashboardTabGroupsQuery = (queryInfo) =>
  chromeCallback((done) => chrome.tabGroups.query(queryInfo, done));
const dashboardTabGroupsGet = (groupId) =>
  chromeCallback((done) => chrome.tabGroups.get(groupId, done));
const dashboardTabGroupsUpdate = (groupId, updateProperties) =>
  chromeCallback((done) =>
    chrome.tabGroups.update(groupId, updateProperties, done)
  );
const dashboardWindowsUpdate = (windowId, updateInfo) =>
  chromeCallback((done) => chrome.windows.update(windowId, updateInfo, done));

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

## SCRIPT DEPLOYMENT IDS
The SuiteQL scriptdeployment table is unusual:
  - scriptdeployment.id is NOT the deployment record internal ID used by the NetSuite record API or deployment URL tools.
  - scriptdeployment.primarykey IS the actual scriptdeployment record internal ID.
  - When a SuiteQL query result for scriptdeployment will be used with netsuite_load_record(recordType: "scriptdeployment"), netsuite_get_script_deployment_url, execute/deployment tools, or a NetSuite deployment URL, use primarykey.
  - Select it explicitly and alias it clearly:
      SELECT sd.primarykey AS deployment_record_id, sd.scriptid, sd.deploymentid
      FROM scriptdeployment sd
      WHERE ROWNUM <= 25

## RECORD-RELATED FILES AND REPORTS
When the user asks for a report/file/document/PDF "for", "with", or "related to" a lead/customer/entity/transaction ID:
  - Treat the number as the record ID unless the user explicitly says "file ID".
  - Do NOT call netsuite_find_file(id: recordId) or netsuite_read_file(fileId: recordId).
  - Use SuiteQL discovery to find the relationship table/field first.
  - Loading the record can confirm identity, but it does not locate related files.

Example: "find the report file with lead id 181"
  1. suiteql_search_tables("lead") and/or suiteql_search_tables("report")
  2. suiteql_get_table_fields / suiteql_get_table_joins on likely customer/customrecord tables
  3. suiteql_execute_query against the related table where the lead/customer field = 181
  4. Use netsuite_read_file only with a file ID returned by that query

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

const recordMcpUsage = (toolName, success, errorMsg, executionSide = "unknown") => {
  mcpUsageLog.unshift({
    tool: toolName,
    timestamp: new Date().toISOString(),
    success,
    executionSide,
    error: errorMsg || null
  });
  if (mcpUsageLog.length > MCP_USAGE_MAX) {
    mcpUsageLog.length = MCP_USAGE_MAX;
  }
};

const CUSTOM_RECORD_FIELD_TYPE_HINTS = [
  "CHECKBOX",
  "CURRENCY",
  "DATE",
  "DATETIME",
  "DECIMAL",
  "DOCUMENT",
  "EMAIL",
  "FREEFORMTEXT",
  "HELP",
  "HYPERLINK",
  "INLINEHTML",
  "INTEGER",
  "LIST",
  "LONGTEXT",
  "MULTISELECT",
  "PASSWORD",
  "PERCENT",
  "PHONE",
  "RICHTEXT",
  "TEXTAREA",
  "TIMEOFDAY"
];

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
    open_panel_custom_records: openCommandView,
    capture_element_screenshot: startElementScreenshotSelection
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
    MCP_INSTALL_INFO: handleMcpInstallInfo,
    NETSUITE_PROXY_FETCH: proxyNetsuiteIframeFetch,
    LIST_OPEN_NETSUITE_ACCOUNTS: listOpenNetsuiteAccounts,
    RECOVER_DASHBOARD_PREVIEW_SESSION: recoverDashboardPreviewSession,
    OPEN_DASHBOARD_PREVIEW: openDashboardPreview,
    SWITCH_DASHBOARD_ACCOUNT: switchDashboardAccount,
    DASHBOARD_ENABLER_READY: dashboardEnablerReady,
    START_ELEMENT_SCREENSHOT_SELECTION: startElementScreenshotSelection,
    CAPTURE_ELEMENT_SCREENSHOT: captureElementScreenshot,
    CLAUDE_CLI_START: handleClaudeCliStart,
    CLAUDE_CLI_CANCEL: handleClaudeCliCancel,
    CLAUDE_CLI_GET_STATE: handleClaudeCliGetState,
    CLAUDE_CLI_CLEAR: handleClaudeCliClear
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

const getDashboardPreviewSessions = async () => {
  const result = await chrome.storage.session.get(DASHBOARD_PREVIEW_SESSIONS_KEY);
  return result[DASHBOARD_PREVIEW_SESSIONS_KEY] || {};
};

const saveDashboardPreviewSessions = async (sessions) => {
  await chrome.storage.session.set({
    [DASHBOARD_PREVIEW_SESSIONS_KEY]: sessions
  });
};

const dashboardEnablerReady = ({ message, sender }) => {
  const readyKey = `${message.sessionId}:${sender.tab?.id}`;
  const waiter = dashboardEnablerReadyWaiters.get(readyKey);
  if (waiter && sender.tab?.id === waiter.tabId) {
    clearTimeout(waiter.timer);
    dashboardEnablerReadyWaiters.delete(readyKey);
    waiter.resolve();
  } else {
    readyDashboardEnablers.add(readyKey);
  }
  return false;
};

const waitForDashboardEnablerReady = (sessionId, tabId, timeoutMs = 20000) =>
  new Promise((resolve) => {
    const readyKey = `${sessionId}:${tabId}`;
    if (readyDashboardEnablers.delete(readyKey)) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      dashboardEnablerReadyWaiters.delete(readyKey);
      resolve();
    }, timeoutMs);
    dashboardEnablerReadyWaiters.set(readyKey, { tabId, timer, resolve });
  });

const buildDashboardEnablerUrl = (sourceUrl, sessionId) => {
  const url = new URL("/app/setup/mainsetup.nl", sourceUrl.origin);
  url.searchParams.set("sc", "-90");
  url.searchParams.set("magicDashboardEnabler", sessionId);
  return url.href;
};

const getAccountIdFromUrl = (url) =>
  new URL(url).hostname.split(".")[0].toUpperCase().replace(/-/g, "_");

const getDashboardSessionIdFromTab = (tab, parameterName) => {
  try {
    return new URL(tab.url || tab.pendingUrl).searchParams.get(parameterName);
  } catch {
    return null;
  }
};

const getDashboardTabUrl = (tab) => tab.url || tab.pendingUrl || "";

const getMagicDashboardGroups = async () => {
  const groups = (await dashboardTabGroupsQuery({})).filter(
    (group) =>
      String(group.title || "").trim().toLowerCase() ===
      DASHBOARD_GROUP_TITLE.toLowerCase()
  );
  const result = [];
  for (const group of groups) {
    const tabs = await dashboardTabsQuery({
      groupId: group.id,
      windowId: group.windowId
    });
    result.push({ group, tabs });
  }
  return result;
};

const openExistingMagicDashboardGroup = async () => {
  // Derive groups from the actual open tabs. This includes collapsed groups
  // and avoids relying on a title-filtered query result.
  const allTabs = await dashboardTabsQuery({});
  const groupIds = [
    ...new Set(
      allTabs
        .map((tab) => tab.groupId)
        .filter((groupId) => groupId !== TAB_GROUP_ID_NONE)
    )
  ];
  const groups = (
    await Promise.all(
      groupIds.map((groupId) =>
        dashboardTabGroupsGet(groupId).catch(() => null)
      )
    )
  ).filter(
    (group) =>
      group &&
      String(group.title || "").trim().toLowerCase() ===
        DASHBOARD_GROUP_TITLE.toLowerCase()
  );
  if (!groups.length) return null;

  const group = groups[0];
  const tabs = allTabs.filter((tab) => tab.groupId === group.id);
  const dashboardTab =
    tabs.find((tab) =>
      getDashboardTabUrl(tab).includes("magicDashboardPreview=")
    ) ||
    tabs.find((tab) => tab.active) ||
    tabs[0];
  await dashboardTabGroupsUpdate(group.id, { collapsed: false });
  await dashboardWindowsUpdate(group.windowId, { focused: true });
  if (dashboardTab?.id) {
    await dashboardTabsUpdate(dashboardTab.id, { active: true });
  }

  return { group, tabs, dashboardTab };
};

const removeDuplicateMagicDashboardGroups = async (groups, keeperGroupId) => {
  for (const entry of groups) {
    if (entry.group.id === keeperGroupId) continue;
    const tabIds = entry.tabs.map((tab) => tab.id).filter(Boolean);
    if (tabIds.length) {
      await dashboardTabsRemove(tabIds).catch(() => undefined);
    }
  }
};

const recoverDashboardSessionFromGroup = async (entry, storedSessions) => {
  const dashboardTab = entry.tabs.find((tab) =>
    getDashboardTabUrl(tab).includes("magicDashboardPreview=")
  );
  const enablerTab = entry.tabs.find((tab) =>
    getDashboardTabUrl(tab).includes("magicDashboardEnabler=")
  );
  if (!dashboardTab?.id || !enablerTab?.id) return null;

  const dashboardSessionId = getDashboardSessionIdFromTab(
    dashboardTab,
    "magicDashboardPreview"
  );
  const enablerSessionId = getDashboardSessionIdFromTab(
    enablerTab,
    "magicDashboardEnabler"
  );
  const sessionId = dashboardSessionId || enablerSessionId;
  if (!sessionId) return null;

  // Repair legacy mismatched marker IDs by navigating the worker to the
  // dashboard's session ID. The existing worker tab is retained.
  if (dashboardSessionId && enablerSessionId !== dashboardSessionId) {
    const repairedUrl = new URL(getDashboardTabUrl(enablerTab));
    repairedUrl.searchParams.set(
      "magicDashboardEnabler",
      dashboardSessionId
    );
    await dashboardTabsUpdate(enablerTab.id, {
      url: repairedUrl.href,
      active: false,
      autoDiscardable: false
    });
    await waitForTabComplete(enablerTab.id);
  }

  const stored = storedSessions[sessionId] || {};
  const enablerUrl = getDashboardTabUrl(enablerTab);
  const accountDomain = new URL(enablerUrl).hostname;
  const session = {
    ...stored,
    sessionId,
    accountId: getAccountIdFromUrl(enablerUrl),
    accountDomain,
    enablerTabId: enablerTab.id,
    dashboardTabId: dashboardTab.id,
    groupId: entry.group.id,
    createdAt: stored.createdAt || 0
  };
  return { sessionId, session, dashboardTab, enablerTab };
};

const getLiveDashboardPreviewSession = async () => {
  const sessions = await getDashboardPreviewSessions();
  const existingGroups = await getMagicDashboardGroups();

  if (existingGroups.length) {
    const recovered = [];
    for (const entry of existingGroups) {
      const live = await recoverDashboardSessionFromGroup(entry, sessions);
      if (live) recovered.push({ entry, live });
    }

    const keeperEntry =
      recovered[0]?.entry ||
      existingGroups.find((entry) =>
        entry.tabs.some((tab) =>
          getDashboardTabUrl(tab).includes("magicDashboardPreview=")
        )
      ) ||
      existingGroups[0];
    await removeDuplicateMagicDashboardGroups(
      existingGroups,
      keeperEntry.group.id
    );

    const keeper = recovered.find(
      ({ entry }) => entry.group.id === keeperEntry.group.id
    )?.live;
    if (keeper) {
      await saveDashboardPreviewSessions({
        [keeper.sessionId]: keeper.session
      });
      await dashboardTabGroupsUpdate(keeper.session.groupId, {
          title: DASHBOARD_GROUP_TITLE,
          color: "blue"
        })
        .catch(() => undefined);
      return keeper;
    }

    // The group itself is authoritative. Even if legacy tabs cannot be paired
    // into a session, expand and focus the existing group instead of creating
    // another one.
    const dashboardTab =
      keeperEntry.tabs.find((tab) =>
        getDashboardTabUrl(tab).includes("magicDashboardPreview=")
      ) || keeperEntry.tabs[0];
    await saveDashboardPreviewSessions({});
    return {
      sessionId: null,
      session: {
        groupId: keeperEntry.group.id,
        dashboardTabId: dashboardTab?.id || null
      },
      dashboardTab,
      enablerTab: keeperEntry.tabs.find((tab) =>
        getDashboardTabUrl(tab).includes("magicDashboardEnabler=")
      )
    };
  }

  const allTabs = await dashboardTabsQuery({});
  const dashboardTabs = allTabs.filter(
    (tab) =>
      tab.id &&
      tab.url?.startsWith(chrome.runtime.getURL("dist/vue-ui/index.html")) &&
      tab.url.includes("magicDashboardPreview=")
  );
  const enablerTabs = allTabs.filter(
    (tab) => tab.id && tab.url?.includes("magicDashboardEnabler=")
  );
  const liveSessions = [];
  const recoveredSessions = {};

  for (const dashboardTab of dashboardTabs) {
    const dashboardUrl = new URL(dashboardTab.url);
    const sessionId = dashboardUrl.searchParams.get("magicDashboardPreview");
    if (!sessionId) continue;
    const enablerTab = enablerTabs.find((tab) => {
      try {
        return (
          new URL(tab.url).searchParams.get("magicDashboardEnabler") ===
          sessionId
        );
      } catch {
        return false;
      }
    });
    if (!enablerTab) continue;

    const stored = sessions[sessionId] || {};
    const accountDomain = new URL(enablerTab.url).hostname;
    let groupId =
      dashboardTab.groupId !== TAB_GROUP_ID_NONE
        ? dashboardTab.groupId
        : enablerTab.groupId;
    if (groupId === TAB_GROUP_ID_NONE) {
      groupId = await dashboardTabsGroup({
        tabIds: [dashboardTab.id, enablerTab.id]
      });
    } else if (dashboardTab.groupId !== enablerTab.groupId) {
      await dashboardTabsGroup({
        groupId,
        tabIds: [dashboardTab.id, enablerTab.id]
      });
    }

    const session = {
      ...stored,
      sessionId,
      accountId: getAccountIdFromUrl(enablerTab.url),
      accountDomain,
      enablerTabId: enablerTab.id,
      dashboardTabId: dashboardTab.id,
      groupId,
      createdAt: stored.createdAt || 0
    };
    recoveredSessions[sessionId] = session;
    liveSessions.push({ sessionId, session, dashboardTab, enablerTab });
  }

  liveSessions.sort(
    (a, b) => Number(b.session.createdAt || 0) - Number(a.session.createdAt || 0)
  );
  const keeper = liveSessions[0] || null;

  // Older duplicate preview groups can only come from previous versions of
  // this flow. Consolidate them so there is exactly one live dashboard group.
  for (const duplicate of liveSessions.slice(1)) {
    delete recoveredSessions[duplicate.sessionId];
    await dashboardTabsRemove([
      duplicate.dashboardTab.id,
      duplicate.enablerTab.id
    ])
      .catch(() => undefined);
  }

  await saveDashboardPreviewSessions(recoveredSessions);
  if (keeper) {
    await dashboardTabGroupsUpdate(keeper.session.groupId, {
        title: DASHBOARD_GROUP_TITLE,
        color: "blue"
      })
      .catch(() => undefined);
  }
  return keeper;
};

const focusDashboardPreviewSession = async (liveSession) => {
  await dashboardTabGroupsUpdate(liveSession.session.groupId, {
    collapsed: false
  })
    .catch(() => undefined);
  const targetTab = liveSession.dashboardTab;
  if (targetTab?.windowId) {
    await dashboardWindowsUpdate(targetTab.windowId, { focused: true })
      .catch(() => undefined);
  }
  if (targetTab?.id) {
    await dashboardTabsUpdate(targetTab.id, { active: true });
  }
};

const decorateDashboardPreviewTab = async (tabId, title) => {
  try {
    const faviconUrl = chrome.runtime.getURL("icons/icon32.png");
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (tabTitle, iconUrl) => {
        const applyDecoration = () => {
          if (document.title !== tabTitle) document.title = tabTitle;
          document
            .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
            .forEach((node) => node.remove());
          const icon = document.createElement("link");
          icon.rel = "icon";
          icon.type = "image/png";
          icon.href = iconUrl;
          document.head.appendChild(icon);
        };

        applyDecoration();
        const root = document.head || document.documentElement;
        const observer = new MutationObserver(() => {
          if (document.title !== tabTitle) applyDecoration();
        });
        observer.observe(root, {
          childList: true,
          subtree: true,
          characterData: true
        });
      },
      args: [title, faviconUrl]
    });
  } catch (error) {
    console.warn(`[Dashboard Preview] Could not decorate tab ${tabId}`, error);
  }
};

const describeNetsuiteAccountTab = (tab, senderTabId) => {
  try {
    const url = new URL(tab.url);
    const accountId = url.hostname
      .split(".")[0]
      .toUpperCase()
      .replace(/-/g, "_");
    const pageTitle = String(tab.title || "").trim();
    return {
      tabId: tab.id,
      accountId,
      label: pageTitle
        ? `${accountId} — ${pageTitle}`
        : accountId,
      url: tab.url,
      current: tab.id === senderTabId
    };
  } catch {
    return null;
  }
};

const listOpenNetsuiteAccounts = ({ message, sender, sendResponse }) => {
  (async () => {
    try {
      const tabs = await dashboardTabsQuery({
        url: "*://*.app.netsuite.com/*"
      });
      const candidates = tabs.filter(
        (tab) =>
          tab.id &&
          tab.url &&
          !tab.url.includes("tempTab=true") &&
          !tab.url.includes("magicDashboardEnabler=")
      );

      const checks = await Promise.all(
        candidates.map(async (tab) => {
          try {
            const response = await sendMessageToTab(tab.id, {
              action: "CHECK_CONNECTION",
              data: {},
              mode: "normal"
            });
            return response?.message === "connected" ? tab : null;
          } catch {
            return null;
          }
        })
      );

      const sessions = await getDashboardPreviewSessions();
      const selectedAccount = message.sessionId
        ? sessions[message.sessionId]?.accountId || null
        : null;
      const connectedAccounts = checks
        .filter(Boolean)
        .map((tab) => describeNetsuiteAccountTab(tab, sender.tab?.id))
        .filter(Boolean);
      const uniqueAccounts = Array.from(
        new Map(
          connectedAccounts.map((account) => [account.accountId, account])
        ).values()
      );
      const accounts = uniqueAccounts
        .map((account) => ({
          ...account,
          current: selectedAccount
            ? account.accountId === selectedAccount
            : account.current
        }))
        .sort((a, b) => Number(b.current) - Number(a.current));

      sendResponse({ ok: true, accounts });
    } catch (error) {
      sendResponse({ ok: false, error: error.message, accounts: [] });
    }
  })();
  return true;
};

const recoverDashboardPreviewSession = ({ message, sendResponse }) => {
  (async () => {
    try {
      const liveSession = await getLiveDashboardPreviewSession();
      if (!liveSession?.sessionId || !liveSession.session?.enablerTabId) {
        throw new Error("Dashboard preview session could not be recovered.");
      }
      if (
        message.sessionId &&
        liveSession.sessionId !== message.sessionId
      ) {
        throw new Error("The open dashboard group belongs to another session.");
      }
      sendResponse({
        ok: true,
        sessionId: liveSession.sessionId,
        session: liveSession.session
      });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();
  return true;
};

const ensureDashboardPreviewOpen = async (message, sender) => {
    let enablerTab = null;
    let dashboardTab = null;
    try {
      // First and absolute rule: if the Chrome group already exists, open it.
      // Nothing else in this flow is allowed to run before this check.
      const existingGroup = await openExistingMagicDashboardGroup();
      if (existingGroup) {
        return { ok: true, reused: true };
      }

      const existingSession = await getLiveDashboardPreviewSession();
      if (existingSession) {
        await focusDashboardPreviewSession(existingSession);
        return {
          ok: true,
          sessionId: existingSession.sessionId,
          reused: true
        };
      }

      const sourceTabId = Number(message.tabId || sender.tab?.id);
      const sourceTab = await dashboardTabsGet(sourceTabId);
      if (
        !sourceTab?.id ||
        !sourceTab.url?.includes("app.netsuite.com") ||
        !sourceTab.windowId
      ) {
        throw new Error("The selected NetSuite account tab is no longer available.");
      }

      const sourceUrl = new URL(sourceTab.url);
      const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const accountId = getAccountIdFromUrl(sourceUrl.href);

      enablerTab = await dashboardTabsCreate({
        url: buildDashboardEnablerUrl(sourceUrl, sessionId),
        active: false,
        windowId: sourceTab.windowId,
        openerTabId: sourceTab.id
      });
      if (!enablerTab.id) throw new Error("Could not create the NetSuite enabler tab.");
      await dashboardTabsUpdate(enablerTab.id, { autoDiscardable: false });
      const enablerReady = waitForDashboardEnablerReady(sessionId, enablerTab.id);
      await waitForTabComplete(enablerTab.id);
      await enablerReady;
      await decorateDashboardPreviewTab(
        enablerTab.id,
        DASHBOARD_ENABLER_TAB_TITLE
      );

      const dashboardUrl = new URL(
        chrome.runtime.getURL("dist/vue-ui/index.html")
      );
      dashboardUrl.searchParams.set("magicDashboardPreview", sessionId);
      dashboardUrl.searchParams.set("account", accountId);

      dashboardTab = await dashboardTabsCreate({
        url: dashboardUrl.href,
        active: false,
        windowId: sourceTab.windowId,
        openerTabId: sourceTab.id
      });
      if (!dashboardTab.id) throw new Error("Could not create the dashboard tab.");
      await waitForTabComplete(dashboardTab.id);
      await decorateDashboardPreviewTab(dashboardTab.id, DASHBOARD_TAB_TITLE);

      const groupId = await dashboardTabsGroup({
        tabIds: [enablerTab.id, dashboardTab.id]
      });
      await dashboardTabGroupsUpdate(groupId, {
          title: DASHBOARD_GROUP_TITLE,
          color: "blue",
          collapsed: false
        })
        .catch(() => undefined);

      const sessions = await getDashboardPreviewSessions();
      sessions[sessionId] = {
        sessionId,
        accountId,
        accountDomain: sourceUrl.hostname,
        sourceTabId: sourceTab.id,
        enablerTabId: enablerTab.id,
        dashboardTabId: dashboardTab.id,
        groupId,
        createdAt: Date.now()
      };
      await saveDashboardPreviewSessions(sessions);
      await dashboardTabsUpdate(dashboardTab.id, { active: true });

      return { ok: true, sessionId };
    } catch (error) {
      if (dashboardTab?.id) {
        await dashboardTabsRemove(dashboardTab.id).catch(() => undefined);
      }
      if (enablerTab?.id) {
        await dashboardTabsRemove(enablerTab.id).catch(() => undefined);
      }
      return { ok: false, error: error.message };
    }
};

const openDashboardPreview = ({ message, sender, sendResponse }) => {
  // Acquire the single-flight lock synchronously, before any asynchronous
  // group lookup. Concurrent clicks/messages share this exact promise.
  if (!dashboardPreviewOpenPromise) {
    dashboardPreviewOpenPromise = ensureDashboardPreviewOpen(message, sender)
      .finally(() => {
        dashboardPreviewOpenPromise = null;
      });
  }

  dashboardPreviewOpenPromise
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });

  return true;
};

const switchDashboardAccount = ({ message, sendResponse }) => {
  (async () => {
    try {
      const liveSession = await getLiveDashboardPreviewSession();
      const sessions = await getDashboardPreviewSessions();
      const session =
        liveSession?.sessionId === message.sessionId
          ? liveSession.session
          : sessions[message.sessionId];
      if (!session) throw new Error("Dashboard preview session not found.");

      const sourceTab = await dashboardTabsGet(Number(message.tabId));
      if (!sourceTab?.id || !sourceTab.url?.includes("app.netsuite.com")) {
        throw new Error("The selected NetSuite account tab is unavailable.");
      }

      const sourceUrl = new URL(sourceTab.url);
      const accountId = getAccountIdFromUrl(sourceUrl.href);
      if (accountId === session.accountId) {
        sendResponse({ ok: true, accountId, accountDomain: sourceUrl.hostname });
        return;
      }

      const enablerTab = await dashboardTabsGet(session.enablerTabId);
      const enablerReady = waitForDashboardEnablerReady(
        message.sessionId,
        enablerTab.id
      );
      await dashboardTabsUpdate(enablerTab.id, {
        url: buildDashboardEnablerUrl(sourceUrl, message.sessionId),
        active: false,
        autoDiscardable: false
      });
      await waitForTabComplete(enablerTab.id);
      await enablerReady;
      await decorateDashboardPreviewTab(
        enablerTab.id,
        DASHBOARD_ENABLER_TAB_TITLE
      );

      await dashboardTabsGroup({
        groupId: session.groupId,
        tabIds: [enablerTab.id, session.dashboardTabId]
      });

      sessions[message.sessionId] = {
        ...session,
        accountId,
        accountDomain: sourceUrl.hostname,
        sourceTabId: sourceTab.id,
        enablerTabId: enablerTab.id
      };
      await saveDashboardPreviewSessions(sessions);
      await dashboardTabGroupsUpdate(session.groupId, {
          title: DASHBOARD_GROUP_TITLE,
          color: "blue",
          collapsed: false
        })
        .catch(() => undefined);
      await dashboardTabsUpdate(session.dashboardTabId, { active: true })
        .catch(() => undefined);

      sendResponse({ ok: true, accountId, accountDomain: sourceUrl.hostname });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();
  return true;
};

const startElementScreenshotSelection = ({ sendResponse } = {}) => {
  chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    try {
      if (!tab?.id || !/^https?:\/\//i.test(tab.url || "")) {
        throw new Error("Open a regular web page before starting element screenshot selection.");
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/elementScreenshotPicker.js"]
      });

      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content/elementScreenshotPicker.js"]
      }).catch((error) => {
        console.warn("[ElementScreenshot] Some frames could not receive the picker:", error);
      });

      await chrome.storage.local.set({
        magic_netsuite_element_screenshot_request: {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          source: "background"
        }
      });

      sendResponse?.({ ok: true });
    } catch (error) {
      console.error("[ElementScreenshot] Failed to start selection:", error);
      sendResponse?.({ ok: false, error: error?.message || String(error) });
    }
  });

  return true;
};

const captureElementScreenshot = ({ sender, sendResponse }) => {
  const tabId = sender?.tab?.id;
  if (!tabId) {
    sendResponse({ ok: false, error: "No tab found for screenshot request." });
    return true;
  }

  chrome.tabs.captureVisibleTab(
    sender.tab.windowId,
    { format: "png" },
    (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({
          ok: false,
          error: chrome.runtime.lastError?.message || "Unable to capture visible tab."
        });
        return;
      }

      sendResponse({ ok: true, dataUrl });
    }
  );

  return true;
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

const proxyNetsuiteIframeFetch = ({ message, sendResponse }) => {
  (async () => {
    try {
      const { url, method = "GET", headers = {}, body = null } = message.payload || {};
      const targetUrl = new URL(url);
      const allowedPaths = new Set([
        "/app/common/scripting/nlapijsonhandler.nl",
        "/app/site/hosting/scriptlet.nl"
      ]);

      if (!/\.app\.netsuite\.com$/i.test(targetUrl.hostname)) {
        throw new Error("Blocked proxy request outside NetSuite application domain.");
      }

      if (!allowedPaths.has(targetUrl.pathname)) {
        throw new Error(`Blocked proxy request to unsupported path: ${targetUrl.pathname}`);
      }

      const cleanHeaders = {};
      const forbiddenHeaders = new Set([
        "accept-encoding",
        "connection",
        "content-length",
        "cookie",
        "host",
        "origin",
        "referer",
        "sec-fetch-dest",
        "sec-fetch-mode",
        "sec-fetch-site"
      ]);

      Object.entries(headers || {}).forEach(([key, value]) => {
        if (!key || value == null) return;
        if (forbiddenHeaders.has(key.toLowerCase())) return;
        cleanHeaders[key] = value;
      });

      const response = await fetch(targetUrl.href, {
        method,
        headers: cleanHeaders,
        body: body == null ? undefined : body,
        credentials: "include",
        redirect: "follow"
      });

      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      sendResponse({
        ok: true,
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: responseHeaders,
        body: await response.text()
      });
    } catch (error) {
      console.error("[SuiteletProxy] Request failed:", error);
      sendResponse({
        ok: false,
        error: error?.message || String(error)
      });
    }
  })();

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
    if (tab.url.includes("magicDashboardEnabler=")) {
      decorateDashboardPreviewTab(
        tabId,
        DASHBOARD_ENABLER_TAB_TITLE
      ).catch(() => undefined);
    } else if (
      tab.url.startsWith(chrome.runtime.getURL("dist/vue-ui/index.html")) &&
      tab.url.includes("magicDashboardPreview=")
    ) {
      decorateDashboardPreviewTab(tabId, DASHBOARD_TAB_TITLE).catch(
        () => undefined
      );
    }
  }
});

// Tab activated → wait until loaded
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await dashboardTabsGet(tabId);
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
const MAGIC_NETSUITE_SERVER_SCRIPT_ID = "customscript_magic_netsuite_server";
const MAGIC_NETSUITE_SERVER_DEPLOYMENT_SCRIPT_ID = "customdeploy_magic_netsuite_server_dp";
let mcpSuiteletServerUrlCache = null;

const SKILLS_DB_NAME = "MagicNetsuiteSkills";
const SKILLS_STORE_NAME = "skills";

function openSkillsDb() {
  return new Promise((resolve, reject) => {
    // Do not pin a version here: the Vue UI owns schema migrations and may
    // already have upgraded this IndexedDB database beyond the background
    // worker's local schema knowledge. Opening without a version attaches to
    // the current database version instead of throwing VersionError.
    const request = indexedDB.open(SKILLS_DB_NAME);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(SKILLS_STORE_NAME)
        ? request.transaction.objectStore(SKILLS_STORE_NAME)
        : db.createObjectStore(SKILLS_STORE_NAME, {
            keyPath: "id",
            autoIncrement: true
          });

      ["name", "tags", "description", "enabled", "domain"].forEach((indexName) => {
        if (!store.indexNames.contains(indexName)) {
          store.createIndex(indexName, indexName);
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open skills database."));
  });
}

async function withSkillsStore(mode, operation) {
  const db = await openSkillsDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SKILLS_STORE_NAME, mode);
      const store = tx.objectStore(SKILLS_STORE_NAME);
      const value = operation(store);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error || new Error("Skills database transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Skills database transaction was aborted."));
    });
  } finally {
    db.close();
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Skills database request failed."));
  });
}

async function getAllStoredSkills() {
  return withSkillsStore("readonly", (store) => requestToPromise(store.getAll()));
}

function normalizeSkillPayload(args) {
  const name = String(args?.name || "").trim();
  const content = String(args?.content || args?.markdown || "").trim();
  if (!name) throw new Error("Skill name is required.");
  if (!content) throw new Error("Skill content or markdown is required.");

  const domain = args?.domain === "sql" ? "sql" : "global";
  return {
    name,
    description: String(args?.description || "").trim(),
    tags: Array.isArray(args?.tags)
      ? args.tags.map((tag) => String(tag).trim()).filter(Boolean).join(", ")
      : String(args?.tags || "").trim(),
    content,
    enabled: args?.enabled === undefined ? true : Boolean(args.enabled),
    domain
  };
}

async function handleMagicSaveSkill(args) {
  const now = new Date().toISOString();
  const payload = normalizeSkillPayload(args);
  const idArg = Number(args?.id);
  const upsertByName = args?.upsertByName !== false;

  const savedId = await withSkillsStore("readwrite", async (store) => {
    let existing = null;
    if (Number.isFinite(idArg) && idArg > 0) {
      existing = await requestToPromise(store.get(idArg));
    }
    if (!existing && upsertByName) {
      const all = await requestToPromise(store.getAll());
      existing = all.find(
        (skill) => String(skill.name || "").toLowerCase() === payload.name.toLowerCase()
      );
    }

    if (existing?.id) {
      await requestToPromise(
        store.put({
          ...existing,
          ...payload,
          id: existing.id,
          createdAt: existing.createdAt || now,
          updatedAt: now
        })
      );
      return existing.id;
    }

    return requestToPromise(
      store.add({
        ...payload,
        createdAt: now,
        updatedAt: now
      })
    );
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            saved: true,
            id: savedId,
            name: payload.name,
            enabled: payload.enabled,
            domain: payload.domain
          },
          null,
          2
        )
      }
    ]
  };
}

async function handleMagicListSkills(args) {
  const includeDisabled = args?.includeDisabled !== false;
  const skills = (await getAllStoredSkills())
    .filter((skill) => includeDisabled || skill.enabled !== false)
    .map(({ id, name, description, tags, enabled, domain, updatedAt }) => ({
      id,
      name,
      description,
      tags,
      enabled: enabled !== false,
      domain: domain || "global",
      updatedAt
    }));
  return { content: [{ type: "text", text: JSON.stringify({ skills }, null, 2) }] };
}

async function handleMagicSearchSkills(args) {
  const query = String(args?.query || "").trim().toLowerCase();
  const includeDisabled = Boolean(args?.includeDisabled);
  const terms = query.split(/\s+/).filter(Boolean);
  const results = (await getAllStoredSkills())
    .filter((skill) => includeDisabled || skill.enabled !== false)
    .map((skill) => {
      const haystack = `${skill.name || ""} ${skill.description || ""} ${skill.tags || ""}`.toLowerCase();
      const score = terms.length
        ? terms.reduce((sum, term) => sum + (haystack.includes(term) ? 2 : 0), 0)
        : 1;
      return { skill, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ skill }) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      enabled: skill.enabled !== false,
      domain: skill.domain || "global"
    }));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ matched: results.length, results }, null, 2)
      }
    ]
  };
}

async function handleMagicLoadSkill(args) {
  const id = Number(args?.id ?? args?.skillId);
  if (!Number.isFinite(id)) throw new Error("Skill id is required.");
  const skill = await withSkillsStore("readonly", (store) => requestToPromise(store.get(id)));
  if (!skill) throw new Error(`Skill with ID ${id} was not found.`);
  return { content: [{ type: "text", text: JSON.stringify(skill, null, 2) }] };
}

async function handleMagicSetSkillEnabled(args) {
  const id = Number(args?.id ?? args?.skillId);
  if (!Number.isFinite(id)) throw new Error("Skill id is required.");
  const enabled = Boolean(args?.enabled);

  await withSkillsStore("readwrite", async (store) => {
    const skill = await requestToPromise(store.get(id));
    if (!skill) throw new Error(`Skill with ID ${id} was not found.`);
    await requestToPromise(
      store.put({
        ...skill,
        enabled,
        updatedAt: new Date().toISOString()
      })
    );
  });

  return { content: [{ type: "text", text: JSON.stringify({ id, enabled }, null, 2) }] };
}

const CUSTOM_TOOLS_STORAGE_KEY = "magic_netsuite_custom_tools_v1";
const CUSTOM_TOOL_BOTH_MODULES = [
  "record", "search", "query", "runtime", "log", "url", "format", "email",
  "https", "http", "xml", "currency", "transaction"
];
const CUSTOM_TOOL_CLIENT_MODULES = ["currentRecord", "dialog", "message"];
const CUSTOM_TOOL_SERVER_MODULES = ["file", "render", "task", "workflow", "encode", "error", "redirect"];
const CUSTOM_TOOL_ALL_MODULES = new Set([
  ...CUSTOM_TOOL_BOTH_MODULES, ...CUSTOM_TOOL_CLIENT_MODULES, ...CUSTOM_TOOL_SERVER_MODULES
]);

function customToolDomainModules(domain) {
  if (domain === "client") return new Set([...CUSTOM_TOOL_BOTH_MODULES, ...CUSTOM_TOOL_CLIENT_MODULES]);
  if (domain === "server") return new Set([...CUSTOM_TOOL_BOTH_MODULES, ...CUSTOM_TOOL_SERVER_MODULES]);
  return new Set(CUSTOM_TOOL_BOTH_MODULES);
}

function normalizeCustomTool(tool) {
  const hasServerOnlyModule = (tool?.modules || []).some((module) => CUSTOM_TOOL_SERVER_MODULES.includes(module));
  return {
    ...tool,
    domain: tool?.domain || (hasServerOnlyModule ? "server" : "both"),
    testInput: tool?.testInput && typeof tool.testInput === "object" && !Array.isArray(tool.testInput) ? tool.testInput : {}
  };
}

async function getStoredCustomTools() {
  const stored = await chrome.storage.local.get(CUSTOM_TOOLS_STORAGE_KEY);
  const tools = stored[CUSTOM_TOOLS_STORAGE_KEY];
  return Array.isArray(tools) ? tools.map(normalizeCustomTool) : [];
}

async function saveStoredCustomTools(tools) {
  await chrome.storage.local.set({ [CUSTOM_TOOLS_STORAGE_KEY]: tools });
}

async function saveStoredCustomToolTestState(id, testInput, result, domain) {
  const tools = await getStoredCustomTools();
  await saveStoredCustomTools(tools.map((tool) => tool.id === id ? {
    ...tool,
    testInput,
    lastTestResult: result,
    lastTestedAt: new Date().toISOString(),
    lastTestDomain: domain
  } : tool));
}

function validateCustomToolDefinition(tool, existing, currentId) {
  const errors = [];
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(tool.name || "")) errors.push("Tool name must be 3-64 lowercase letters, numbers, or underscores and start with a letter.");
  if (!String(tool.displayName || "").trim()) errors.push("displayName is required.");
  if (!String(tool.description || "").trim()) errors.push("description is required.");
  if (!["client", "server", "both"].includes(tool.domain)) errors.push("domain must be client, server, or both.");
  if (!tool.inputSchema || typeof tool.inputSchema !== "object" || Array.isArray(tool.inputSchema) || tool.inputSchema.type !== "object") errors.push('inputSchema must be an object schema with type "object".');
  if (!String(tool.code || "").trim()) errors.push("code is required.");
  if (existing.some((candidate) => candidate.name === tool.name && candidate.id !== currentId)) errors.push(`A custom tool named "${tool.name}" already exists.`);
  const allowed = customToolDomainModules(tool.domain);
  for (const module of tool.modules || []) {
    if (!CUSTOM_TOOL_ALL_MODULES.has(module) || !allowed.has(module)) errors.push(`Module ${module} is not available in the ${tool.domain} domain.`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
}

async function handleMagicCreateCustomTool(args) {
  const existing = await getStoredCustomTools();
  const now = new Date().toISOString();
  const tool = {
    id: globalThis.crypto?.randomUUID?.() || `custom_tool_${Date.now()}`,
    name: String(args?.name || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64),
    displayName: String(args?.displayName || "").trim(),
    description: String(args?.description || "").trim(),
    tags: Array.isArray(args?.tags) ? [...new Set(args.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))] : [],
    domain: String(args?.domain || "both"),
    modules: Array.isArray(args?.modules) ? [...new Set(args.modules.map(String))] : [],
    inputSchema: args?.inputSchema,
    testInput: args?.testInput && typeof args.testInput === "object" && !Array.isArray(args.testInput) ? args.testInput : {},
    code: String(args?.code || ""),
    status: "draft",
    risk: args?.risk === "write" ? "write" : "read",
    enabled: true,
    createdAt: now,
    updatedAt: now
  };
  const duplicate = existing.find((candidate) => candidate.name === tool.name);
  if (duplicate) throw new Error(`Custom tool "${tool.name}" already exists. Use magic_netsuite_update_custom_tool to edit it.`);
  validateCustomToolDefinition(tool, existing);
  await saveStoredCustomTools([...existing, tool]);
  return asMcpTextResult({ created: true, status: "draft", tool });
}

async function handleMagicUpdateCustomTool(args) {
  const tools = await getStoredCustomTools();
  const toolName = String(args?.toolName || "").trim().toLowerCase();
  if (!toolName) throw new Error("toolName is required.");
  const existing = tools.find((candidate) => String(candidate.name || "").toLowerCase() === toolName);
  if (!existing) throw new Error(`Custom tool "${toolName}" was not found.`);
  const has = (field) => Object.prototype.hasOwnProperty.call(args || {}, field);
  const updated = {
    ...existing,
    name: has("name") ? String(args.name || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) : existing.name,
    displayName: has("displayName") ? String(args.displayName || "").trim() : existing.displayName,
    description: has("description") ? String(args.description || "").trim() : existing.description,
    tags: has("tags") ? (Array.isArray(args.tags) ? [...new Set(args.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))] : []) : existing.tags,
    domain: has("domain") ? String(args.domain) : existing.domain,
    modules: has("modules") ? (Array.isArray(args.modules) ? [...new Set(args.modules.map(String))] : []) : existing.modules,
    inputSchema: has("inputSchema") ? args.inputSchema : existing.inputSchema,
    testInput: has("testInput") ? (args.testInput && typeof args.testInput === "object" && !Array.isArray(args.testInput) ? args.testInput : {}) : existing.testInput,
    code: has("code") ? String(args.code || "") : existing.code,
    risk: has("risk") ? (args.risk === "write" ? "write" : "read") : existing.risk,
    enabled: has("enabled") ? Boolean(args.enabled) : existing.enabled,
    status: "draft",
    updatedAt: new Date().toISOString()
  };
  validateCustomToolDefinition(updated, tools, existing.id);
  await saveStoredCustomTools(tools.map((tool) => tool.id === existing.id ? updated : tool));
  return asMcpTextResult({ updated: true, status: "draft", tool: updated });
}

async function handleMagicSearchCustomTools(args) {
  const terms = String(args?.query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = (await getStoredCustomTools())
    .filter((tool) => tool?.enabled !== false && tool?.status === "active")
    .map((tool) => {
      const nameText = `${tool.name || ""} ${tool.displayName || ""}`.toLowerCase();
      const metadata = `${tool.description || ""} ${(tool.tags || []).join(" ")} ${(tool.modules || []).join(" ")}`.toLowerCase();
      const score = terms.length === 0 ? 1 : terms.reduce(
        (sum, term) => sum + (nameText.includes(term) ? 8 : 0) + (metadata.includes(term) ? 3 : 0),
        0
      );
      return { tool, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || String(b.tool.updatedAt || "").localeCompare(String(a.tool.updatedAt || "")))
    .map(({ tool, score }) => ({
      id: tool.id,
      name: tool.name,
      displayName: tool.displayName,
      description: tool.description,
      tags: tool.tags || [],
      modules: tool.modules || [],
      domain: tool.domain,
      inputSchema: tool.inputSchema || { type: "object", properties: {} },
      risk: tool.risk || "write",
      score
    }));
  return { content: [{ type: "text", text: JSON.stringify({ matched: results.length, results }, null, 2) }] };
}

async function executeStoredCustomTool(tool, args) {
  const toolName = String(args?.toolName || args?.name || "").trim().toLowerCase();
  if (!toolName) throw new Error("toolName is required.");
  const input = args?.input && typeof args.input === "object" && !Array.isArray(args.input)
    ? args.input
    : {};
  const required = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [];
  for (const field of required) {
    if (input[field] === undefined || input[field] === null || input[field] === "") {
      throw new Error(`Missing required input: ${field}`);
    }
  }
  const properties = tool.inputSchema?.properties && typeof tool.inputSchema.properties === "object"
    ? tool.inputSchema.properties
    : {};
  for (const [field, value] of Object.entries(input)) {
    const expectedType = properties[field]?.type;
    if (!expectedType || value === null || value === undefined) continue;
    const valid = expectedType === "array"
      ? Array.isArray(value)
      : expectedType === "object"
        ? typeof value === "object" && !Array.isArray(value)
        : expectedType === "integer"
          ? Number.isInteger(value)
          : typeof value === expectedType;
    if (!valid) throw new Error(`Invalid input type for ${field}: expected ${expectedType}.`);
  }
  const requestedDomain = args?.executionDomain;
  if (requestedDomain && !["client", "server"].includes(requestedDomain)) throw new Error("executionDomain must be client or server.");
  const executionDomain = tool.domain === "both" ? (requestedDomain || "client") : tool.domain;
  if (requestedDomain && tool.domain !== "both" && requestedDomain !== tool.domain) throw new Error(`This tool is restricted to ${tool.domain} execution.`);
  const allowedModules = customToolDomainModules(tool.domain);
  const modules = Array.isArray(tool.modules)
    ? tool.modules.filter((module) => allowedModules.has(module))
    : [];
  const inputJson = JSON.stringify(JSON.stringify(input));
  const metadataJson = JSON.stringify(JSON.stringify({
    toolName: tool.name,
    displayName: tool.displayName,
    modules, domain: executionDomain,
    executedAt: new Date().toISOString()
  }));
  const moduleObject = modules.map((module) => `${module}: ${module}`).join(", ");
  const invocation = executionDomain === "server"
    ? `(function(input, context) {\n${String(tool.code || "")}\n})(__customToolInput, __customToolContext)`
    : `(async function(input, context) {\n${String(tool.code || "")}\n})(__customToolInput, __customToolContext)`;
  const code = [
    `const __customToolInput = JSON.parse(${inputJson});`,
    `const __customToolContext = Object.freeze({ ...JSON.parse(${metadataJson}), modules: Object.freeze({ ${moduleObject} }) });`,
    `return ${invocation};`
  ].join("\n");
  const execution = await callNetsuiteRoute(
    executionDomain === "server" ? "RUN_QUICK_SCRIPT_SERVER" : "RUN_QUICK_SCRIPT",
    { code },
    `Custom tool "${tool.name}" failed.`
  );
  if (execution?.error) throw new Error(String(execution.error));
  return asMcpTextResult({
    tool: tool.name, executionDomain,
    result: execution?.result ?? execution,
    logs: execution?.logs ?? []
  });
}

async function handleMagicCallCustomTool(args) {
  const toolName = String(args?.toolName || args?.name || "").trim().toLowerCase();
  if (!toolName) throw new Error("toolName is required.");
  const tool = (await getStoredCustomTools()).find((candidate) => String(candidate?.name || "").toLowerCase() === toolName);
  if (!tool || tool.enabled === false || tool.status !== "active") throw new Error(`Active custom tool "${toolName}" was not found.`);
  return executeStoredCustomTool(tool, args);
}

async function handleMagicTestCustomTool(args) {
  const toolName = String(args?.toolName || args?.name || "").trim().toLowerCase();
  if (!toolName) throw new Error("toolName is required.");
  const tool = (await getStoredCustomTools()).find((candidate) => String(candidate?.name || "").toLowerCase() === toolName);
  if (!tool) throw new Error(`Custom tool "${toolName}" was not found.`);
  const testInput = args?.input && typeof args.input === "object" && !Array.isArray(args.input) ? args.input : tool.testInput;
  const domain = tool.domain === "both" ? (args?.executionDomain || "client") : tool.domain;
  try {
    const result = await executeStoredCustomTool(tool, { ...args, input: testInput, executionDomain: domain });
    await saveStoredCustomToolTestState(tool.id, testInput, result, domain);
    return result;
  } catch (error) {
    await saveStoredCustomToolTestState(tool.id, testInput, { error: error?.message || String(error) }, domain);
    throw error;
  }
}

const MCP_SERVER_SIDE_TOOL_NAMES = new Set([
  "suiteql_search_tables",
  "suiteql_get_table_fields",
  "suiteql_get_table_joins",
  "suiteql_execute_query",
  "suiteql_discover_field_values",
  "netsuite_load_record",
  "netsuite_get_record_sublists",
  "netsuite_get_record_fields",
  "netsuite_list_record_types",
  "netsuite_lists",
  "netsuite_list_items",
  "netsuite_create_list",
  "netsuite_update_list",
  "netsuite_create_record",
  "netsuite_update_record_fields",
  "netsuite_inspect_custom_record_field",
  "netsuite_find_file",
  "netsuite_find_folder",
  "netsuite_list_folder",
  "netsuite_read_file",
  "netsuite_create_folder",
  "netsuite_upload_file",
  "netsuite_update_file_content",
  "netsuite_rename_file",
  "netsuite_rename_folder",
  "netsuite_delete_file",
  "netsuite_delete_folder",
  "netsuite_move_items",
  "netsuite_get_scripts",
  "netsuite_get_script_files",
  "netsuite_get_deployed_scripts",
  "netsuite_get_logs",
  "netsuite_sdf_deploy",
  "netsuite_sdf_list_objects",
  "netsuite_sdf_import_object",
  "netsuite_create_script_field",
  "netsuite_update_script_field",
  "netsuite_update_metadata_record",
  "netsuite_run_quick_script",
  "netsuite_submit_task",
  "netsuite_check_task_status",
  "netsuite_server_info"
]);

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
    }, 10000);

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

// ── Claude CLI runs ──
// The native host starts the locally installed `claude -p` process. The
// background worker only retains a compact, restorable view of its JSONL stream.
const CLAUDE_CLI_RUNS_KEY = "magic_netsuite_claude_cli_runs";
let claudeCliRuns = null;
let claudeCliPersistTimer = null;

async function ensureClaudeCliRuns() {
  if (claudeCliRuns) return claudeCliRuns;
  const stored = await chrome.storage.session.get([CLAUDE_CLI_RUNS_KEY]);
  claudeCliRuns = stored?.[CLAUDE_CLI_RUNS_KEY] || {};
  return claudeCliRuns;
}

function persistClaudeCliRunsSoon() {
  clearTimeout(claudeCliPersistTimer);
  claudeCliPersistTimer = setTimeout(() => {
    chrome.storage.session.set({ [CLAUDE_CLI_RUNS_KEY]: claudeCliRuns || {} }).catch(() => {});
  }, 200);
}

function claudeTextDelta(event) {
  if (event?.type !== "stream_event") return "";
  const streamEvent = event.event;
  if (streamEvent?.type === "content_block_delta" && streamEvent?.delta?.type === "text_delta") {
    return String(streamEvent.delta.text || "");
  }
  return "";
}

function compactClaudeCliEvent(event) {
  try {
    const raw = JSON.stringify(event);
    if (raw.length <= 60000) return event;
    return {
      type: event?.type || "large_event",
      subtype: event?.subtype,
      truncated: true,
      preview: raw.slice(0, 60000),
      message: "Event was truncated in restored history; the live event was still delivered to the open view."
    };
  } catch {
    return { type: event?.type || "invalid_event", message: "Event could not be saved in run history." };
  }
}

async function recordClaudeCliEvent(message) {
  const runs = await ensureClaudeCliRuns();
  const run = runs[message.runId];
  if (!run) return;
  const event = message.event || {};
  const delta = claudeTextDelta(event);

  if (delta) {
    run.liveText = `${run.liveText || ""}${delta}`.slice(-500000);
  } else if (event.type !== "stream_event") {
    run.events = [...(run.events || []), compactClaudeCliEvent(event)].slice(-300);
  }

  if (event.type === "process_started") {
    Object.assign(run, event, { status: "running" });
  } else if (event.type === "system" && event.subtype === "init") {
    run.sessionId = event.session_id || run.sessionId;
    run.model = event.model || run.model;
  } else if (event.type === "result") {
    run.result = event.result || "";
    run.sessionId = event.session_id || run.sessionId;
    run.costUsd = event.total_cost_usd;
    run.durationMs = event.duration_ms;
    run.turns = event.num_turns;
    run.status = event.is_error ? "failed" : "completed";
  } else if (event.type === "process_error") {
    run.error = event.message || "Claude CLI failed to start.";
    run.status = "failed";
  } else if (event.type === "process_exit") {
    run.finishedAt = event.finishedAt || new Date().toISOString();
    run.exitCode = event.exitCode;
    run.status = event.cancelled ? "cancelled" : event.exitCode === 0 ? "completed" : "failed";
  }
  run.updatedAt = new Date().toISOString();
  persistClaudeCliRunsSoon();
}

async function waitForNativeHost() {
  await mcpConnect();
  for (let attempt = 0; attempt < 20 && !mcpNativePort; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!mcpNativePort) throw new Error(mcpNativeLastError || "Native host is not connected.");
}

const handleClaudeCliStart = ({ message, sendResponse }) => {
  (async () => {
    try {
      await waitForNativeHost();
      const runs = await ensureClaudeCliRuns();
      const runId = `claude-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      runs[runId] = {
        runId,
        prompt: String(message.prompt || ""),
        cwd: String(message.cwd || ""),
        model: message.model || "default",
        permissionMode: message.permissionMode || "plan",
        maxTurns: Number(message.maxTurns) || 12,
        status: "starting",
        startedAt: new Date().toISOString(),
        liveText: "",
        events: []
      };
      await chrome.storage.session.set({ [CLAUDE_CLI_RUNS_KEY]: runs });
      const response = await queryNativeHostDirect({ ...message, type: "CLAUDE_CLI_START", runId });
      if (response.success === false) {
        runs[runId].status = "failed";
        runs[runId].error = response.error || "Claude CLI failed to start.";
        await chrome.storage.session.set({ [CLAUDE_CLI_RUNS_KEY]: runs });
        throw new Error(runs[runId].error);
      }
      sendResponse({ ok: true, runId, ...(response.result || {}) });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();
  return true;
};

const handleClaudeCliCancel = ({ message, sendResponse }) => {
  (async () => {
    try {
      await waitForNativeHost();
      const response = await queryNativeHostDirect({ type: "CLAUDE_CLI_CANCEL", runId: message.runId });
      sendResponse(response.success === false
        ? { ok: false, error: response.error }
        : { ok: true, ...(response.result || {}) });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();
  return true;
};

const handleClaudeCliGetState = ({ sendResponse }) => {
  (async () => {
    const runs = await ensureClaudeCliRuns();
    sendResponse({
      ok: true,
      runs: Object.values(runs).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))),
      nativeConnected: Boolean(mcpNativePort),
      nativeError: mcpNativeLastError
    });
  })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
};

const handleClaudeCliClear = ({ message, sendResponse }) => {
  (async () => {
    const runs = await ensureClaudeCliRuns();
    if (message.runId) {
      if (runs[message.runId]?.status === "running") throw new Error("Cancel the run before clearing it.");
      delete runs[message.runId];
    } else {
      for (const [runId, run] of Object.entries(runs)) {
        if (!['running', 'starting'].includes(run.status)) delete runs[runId];
      }
    }
    await chrome.storage.session.set({ [CLAUDE_CLI_RUNS_KEY]: runs });
    sendResponse({ ok: true });
  })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
};

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
    const tab = await dashboardTabsGet(mcpDedicatedTabId);
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

chrome.tabs.onRemoved.addListener((tabId) => {
  (async () => {
    const sessions = await getDashboardPreviewSessions();
    let changed = false;
    for (const [sessionId, session] of Object.entries(sessions)) {
      if (
        session.dashboardTabId === tabId ||
        session.enablerTabId === tabId
      ) {
        delete sessions[sessionId];
        changed = true;
      }
    }
    if (changed) await saveDashboardPreviewSessions(sessions);
  })().catch(() => undefined);
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

  if (message.type === "CLAUDE_CLI_EVENT") {
    await recordClaudeCliEvent(message);
    chrome.runtime.sendMessage(message).catch(() => {});
    return;
  }

  // Handle direct query responses (not MCP client pipeline)
  if (message.requestId && mcpDirectQueryPending.has(message.requestId)) {
    const pending = mcpDirectQueryPending.get(message.requestId);
    mcpDirectQueryPending.delete(message.requestId);
    clearTimeout(pending.timer);
    pending.resolve(message);
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
const freemarkerPreviewSessions = new Map();

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
    name: "magic_netsuite_save_skill",
    description:
      "Save or update a reusable Markdown skill in the Magic NetSuite extension skill library. Use this when the user asks you to create a skill for Magic NetSuite. Skills are available to the Vue Skills view and local agent harnesses.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Optional existing skill ID to update." },
        name: { type: "string", description: "Short skill name." },
        description: { type: "string", description: "One-sentence description for search results." },
        tags: {
          anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          description: "Comma-separated tags or an array of tags."
        },
        content: { type: "string", description: "Markdown skill content." },
        markdown: { type: "string", description: "Alias for content." },
        domain: { type: "string", enum: ["global", "sql"], description: "Skill scope. Defaults to global." },
        enabled: { type: "boolean", description: "Whether the skill is enabled. Defaults to true." },
        upsertByName: { type: "boolean", description: "Update a same-name skill if found. Defaults to true." }
      },
      required: ["name"]
    }
  },
  {
    name: "magic_netsuite_list_skills",
    description: "List Magic NetSuite skill metadata from the extension skill library.",
    inputSchema: {
      type: "object",
      properties: {
        includeDisabled: { type: "boolean", description: "Include disabled skills. Defaults to true." }
      }
    }
  },
  {
    name: "magic_netsuite_search_skills",
    description: "Search the local Magic NetSuite skill library by name, description, and tags. Use this BEFORE netsuite_search_docs or other external documentation for NetSuite, SuiteScript, FreeMarker, SuiteQL, UI workflow, or project-specific knowledge questions. Returns metadata only; call magic_netsuite_load_skill for relevant results.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms. Leave empty to list all enabled skills." },
        includeDisabled: { type: "boolean", description: "Include disabled skills. Defaults to false." }
      }
    }
  },
  {
    name: "magic_netsuite_load_skill",
    description: "Load one Magic NetSuite skill, including its Markdown content, by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Skill ID." },
        skillId: { type: "number", description: "Alias for id." }
      }
    }
  },
  {
    name: "magic_netsuite_set_skill_enabled",
    description: "Enable or disable a Magic NetSuite skill by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Skill ID." },
        skillId: { type: "number", description: "Alias for id." },
        enabled: { type: "boolean", description: "True to enable, false to disable." }
      },
      required: ["enabled"]
    }
  },
  {
    name: "magic_netsuite_search_custom_tools",
    description: "Search active user-created Magic NetSuite tools. Returns metadata, execution domain, selected modules, risk, and inputSchema without returning implementation source.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords describing the needed custom capability. Leave empty to list all active custom tools." }
      }
    }
  },
  {
    name: "magic_netsuite_create_custom_tool",
    description: "Create a new editable custom NetSuite tool as a draft. If the name already exists, use magic_netsuite_update_custom_tool.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" }, displayName: { type: "string" }, description: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        domain: { type: "string", enum: ["client", "server", "both"] },
        modules: { type: "array", items: { type: "string" } },
        inputSchema: { type: "object" }, testInput: { type: "object", description: "Concrete saved test arguments matching inputSchema." }, code: { type: "string" },
        risk: { type: "string", enum: ["read", "write"] }
      },
      required: ["name", "displayName", "description", "domain", "modules", "inputSchema", "testInput", "code", "risk"]
    }
  },
  {
    name: "magic_netsuite_update_custom_tool",
    description: "Partially update an existing custom NetSuite tool by exact name. Omitted fields are preserved and AI edits return the tool to draft status for review.",
    inputSchema: {
      type: "object",
      properties: {
        toolName: { type: "string" }, name: { type: "string" }, displayName: { type: "string" },
        description: { type: "string" }, tags: { type: "array", items: { type: "string" } },
        domain: { type: "string", enum: ["client", "server", "both"] },
        modules: { type: "array", items: { type: "string" } }, inputSchema: { type: "object" }, testInput: { type: "object" },
        code: { type: "string" }, risk: { type: "string", enum: ["read", "write"] }, enabled: { type: "boolean" }
      },
      required: ["toolName"]
    }
  },
  {
    name: "magic_netsuite_test_custom_tool",
    description: "Test a saved active or draft custom tool in an allowed domain. Uses its saved testInput when input is omitted and stores the latest result on that tool.",
    inputSchema: {
      type: "object",
      properties: {
        toolName: { type: "string" }, input: { type: "object" },
        executionDomain: { type: "string", enum: ["client", "server"] }
      },
      required: ["toolName", "executionDomain"]
    }
  },
  {
    name: "magic_netsuite_call_custom_tool",
    description: "Execute an active user-created Magic NetSuite tool in the authenticated NetSuite tab. Search first, then pass the exact toolName and an input object matching its inputSchema.",
    inputSchema: {
      type: "object",
      properties: {
        toolName: { type: "string" },
        input: { type: "object" },
        executionDomain: { type: "string", enum: ["client", "server"] }
      },
      required: ["toolName", "input"]
    }
  },
  {
    name: "netsuite_switch_environment",
    description:
      "Switch the NetSuite account environment used by subsequent MCP tool calls. " +
      "Pass an account ID such as 1964539 or 9937091_SB1. The extension selects a connected tab for that account, " +
      "or opens a dedicated background tab when necessary. Use an empty accountId to restore active-tab routing.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: {
          type: "string",
          description:
            "NetSuite account ID from the account subdomain, e.g. 1964539 or 9937091_SB1. Empty string clears the preference."
        }
      },
      required: ["accountId"]
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
    description:
      "Execute a SuiteQL query. NEVER use LIMIT — it is not valid SuiteQL syntax and will error. Use ROWNUM in a WHERE clause to limit rows: WHERE ROWNUM <= 25. IMPORTANT: when querying scriptdeployment, select primarykey; it is the actual deployment record internal ID. scriptdeployment.id is not.",
    inputSchema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description:
            "Valid SuiteQL query. Must use ROWNUM <= N for row limiting, never LIMIT. For scriptdeployment, select primarykey when you need the deployment record internal ID."
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
      "Search the official NetSuite help documentation. Returns a list of matching pages with title, URL, and summary. For NetSuite, SuiteScript, FreeMarker, SuiteQL, UI workflow, or project-specific knowledge questions, first call magic_netsuite_search_skills and load any relevant local skill. Use this docs tool only when local skills are missing or insufficient, then call 'netsuite_read_doc_page' with a returned URL to get the full content.",
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
    name: "netsuite_lists",
    description:
      "List NetSuite custom lists from the current account. Returns metadata only: name, internalId, and inactive status. " +
      "Use this to discover the listId to pass to netsuite_list_items. Optional query filters by list name or internal ID.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional partial list name or internal ID filter."
        },
        includeInactive: {
          type: "boolean",
          description: "Include inactive custom lists. Defaults to false."
        }
      }
    }
  },
  {
    name: "netsuite_list_items",
    description:
      "Load a NetSuite custom list and return its values from the customvalue sublist. " +
      "Pass listId from netsuite_lists. Returns each value's internalId, display value, line number, and inactive status.",
    inputSchema: {
      type: "object",
      properties: {
        listId: {
          type: "string",
          description: "The custom list internal ID returned by netsuite_lists, or a valid customlist script ID when supported by NetSuite record.load."
        },
        includeInactive: {
          type: "boolean",
          description: "Include inactive list values. Defaults to false."
        }
      },
      required: ["listId"]
    }
  },
  {
    name: "netsuite_create_list",
    description:
      "Create a NetSuite custom list using the native custlist.nl form POST. " +
      "Destructive: creates metadata in the account. Pass name, scriptId, and values. " +
      "The scriptId accepts customlist_my_list, my_list, or _my_list and is normalized to NetSuite's metadata suffix format.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Custom list display name." },
        scriptId: { type: "string", description: "Custom list script ID, e.g. customlist_ai_session_status, ai_session_status, or _ai_session_status." },
        description: { type: "string" },
        isOrdered: { type: "boolean", description: "Whether the custom list is ordered. Defaults to true." },
        isHierarchical: { type: "boolean", description: "Whether the custom list is hierarchical. Defaults to false." },
        values: {
          type: "array",
          items: {
            anyOf: [
              { type: "string" },
              {
                type: "object",
                properties: {
                  value: { type: "string" },
                  abbreviation: { type: "string" },
                  isInactive: { type: "boolean" },
                  scriptId: { type: "string" }
                },
                required: ["value"]
              }
            ]
          },
          description: "Custom list values. Strings are accepted, or objects like { value: 'IN_PROGRESS', abbreviation: 'I' }."
        },
        listFields: { type: "object", description: "Additional raw form fieldId-to-value pairs to include in the custlist.nl POST." }
      },
      required: ["name", "scriptId", "values"]
    }
  },
  {
    name: "netsuite_update_list",
    description:
      "Update a NetSuite custom list using the native custlist.nl edit form POST. " +
      "Destructive: modifies metadata in the account. Use valuesToAdd to append missing values, valuesToUpdate to rename/change existing values, or replaceAllValues to replace the whole value set. " +
      "The tool fetches the existing edit form first and preserves NetSuite row tokens/translation metadata where possible.",
    inputSchema: {
      type: "object",
      properties: {
        listId: { type: "string", description: "Internal ID of the custom list to edit." },
        name: { type: "string", description: "Optional new custom list display name." },
        scriptId: { type: "string", description: "Optional custom list script ID, e.g. customlist_ai_session_status or _ai_session_status." },
        description: { type: "string" },
        isOrdered: { type: "boolean", description: "Whether the custom list is ordered." },
        isHierarchical: { type: "boolean", description: "Whether the custom list is hierarchical." },
        valuesToAdd: {
          type: "array",
          items: { type: "object", properties: { value: { type: "string" }, abbreviation: { type: "string" }, isInactive: { type: "boolean" }, scriptId: { type: "string" } }, required: ["value"] },
          description: "Values to add if missing, e.g. [{ value: 'FAILED', abbreviation: 'F' }]. Existing matching values are skipped."
        },
        valuesToUpdate: {
          type: "array",
          items: { type: "object", properties: { id: { type: "string" }, internalId: { type: "string" }, currentValue: { type: "string" }, value: { type: "string" }, abbreviation: { type: "string" }, isInactive: { type: "boolean" } }, required: ["value"] },
          description: "Existing values to update. Match by id/internalId when known, otherwise by currentValue; value is the new display value."
        },
        replaceAllValues: {
          type: "array",
          items: { type: "object", properties: { id: { type: "string" }, internalId: { type: "string" }, value: { type: "string" }, abbreviation: { type: "string" }, isInactive: { type: "boolean" } }, required: ["value"] },
          description: "Complete desired value set. Existing rows are preserved by id/internalId/currentValue/value where possible; omitted rows are removed from the submitted list."
        },
        listFields: { type: "object", description: "Additional raw form fieldId-to-value pairs to include in the custlist.nl POST." }
      },
      required: ["listId"]
    }
  },
  {
    name: "netsuite_create_record",
    description:
      "Create a NetSuite standard or custom record using SuiteScript record.create, Record.setValue, and Record.save. " +
      "Destructive: this creates data in the account. Pass recordType and a values object mapping body field IDs to values. " +
      "Date fields are normalized automatically: DATE, DATETIME, and DATETIMETZ fields receive SuiteScript Date objects. " +
      "For custom records, recordType is the custom record script ID such as customrecord_my_type. This tool does not create sublist lines or subrecords.",
    inputSchema: {
      type: "object",
      properties: {
        recordType: {
          type: "string",
          description: "The SuiteScript record type ID, e.g. customer, task, customrecord_my_type."
        },
        values: {
          type: "object",
          description: "Body field values keyed by field ID, e.g. { \"companyname\": \"Acme\" }."
        },
        defaultValues: {
          type: "object",
          description: "Optional defaultValues passed to record.create for record types that require creation defaults."
        },
        isDynamic: {
          type: "boolean",
          description: "Create the record in dynamic mode. Defaults to false."
        },
        enableSourcing: {
          type: "boolean",
          description: "Record.save enableSourcing option. Defaults to true."
        },
        ignoreMandatoryFields: {
          type: "boolean",
          description: "Record.save ignoreMandatoryFields option. Defaults to false."
        }
      },
      required: ["recordType", "values"]
    }
  },
  {
    name: "netsuite_update_record_fields",
    description:
      "Update body fields on an existing NetSuite record using SuiteScript record.submitFields. " +
      "Destructive: this modifies data in the account. This is for body fields only; NetSuite does not allow submitFields to update sublist line fields or subrecords. " +
      "Date fields are normalized automatically: DATE, DATETIME, and DATETIMETZ fields receive SuiteScript Date objects. " +
      "Pass recordType, recordId, and a values object mapping field IDs to values.",
    inputSchema: {
      type: "object",
      properties: {
        recordType: {
          type: "string",
          description: "The SuiteScript record type ID, e.g. customer, salesorder, customrecord_my_type."
        },
        recordId: {
          type: "string",
          description: "Internal ID of the record to update."
        },
        values: {
          type: "object",
          description: "Body field values keyed by field ID, e.g. { \"memo\": \"Updated by MCP\" }."
        },
        enableSourcing: {
          type: "boolean",
          description: "record.submitFields enableSourcing option. Defaults to true."
        },
        ignoreMandatoryFields: {
          type: "boolean",
          description: "record.submitFields ignoreMandatoryFields option. Defaults to false."
        }
      },
      required: ["recordType", "recordId", "values"]
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
  {
    name: "netsuite_create_script_field",
    description:
      "Find or create a NetSuite script parameter field using the native scriptcustfield.nl form POST. " +
      "Uses the same fieldType and selectRecordType values as custom record fields. " +
      "The scriptId key accepts either 'custscript_my_param' or 'my_param' and is normalized to NetSuite's metadata suffix format.",
    inputSchema: {
      type: "object",
      properties: {
        scriptInternalId: {
          type: "string",
          description: "Internal ID of the parent script record; posted as scripttype."
        },
        scriptRecordId: {
          type: "string",
          description: "Alias for scriptInternalId."
        },
        label: { type: "string" },
        scriptId: {
          type: "string",
          description: "Convenience value for the script parameter scriptid field. Passing 'custscript_my_param' or 'my_param' is normalized to '_my_param'."
        },
        fieldType: {
          type: "string",
          examples: CUSTOM_RECORD_FIELD_TYPE_HINTS,
          description: "Convenience value for the fieldtype field, using the example values listed above."
        },
        selectRecordType: {
          type: "string",
          description: "Convenience value for selectrecordtype when fieldType is SELECT or MULTISELECT."
        },
        description: { type: "string" },
        storeValue: { type: "boolean" },
        fieldValues: {
          type: "object",
          description: "Additional raw form fieldId-to-value pairs to include in the scriptcustfield.nl POST. scripttype is always set by the tool."
        }
      }
    }
  },
  {
    name: "netsuite_update_script_field",
    description:
      "Edit an existing NetSuite script parameter field using the native scriptcustfield.nl edit form POST. " +
      "The tool loads the existing edit form first, preserves NetSuite metadata/sublist fields, and overrides only the provided friendly fields and fieldValues.",
    inputSchema: {
      type: "object",
      properties: {
        scriptFieldId: {
          type: "string",
          description: "Internal ID of the script parameter field to edit."
        },
        fieldId: {
          type: "string",
          description: "Alias for scriptFieldId."
        },
        scriptInternalId: {
          type: "string",
          description: "Internal ID of the parent script record; posted as scripttype."
        },
        scriptRecordId: {
          type: "string",
          description: "Alias for scriptInternalId."
        },
        label: { type: "string" },
        fieldType: {
          type: "string",
          examples: CUSTOM_RECORD_FIELD_TYPE_HINTS,
          description: "Optional new fieldtype value. If omitted, the existing type is preserved."
        },
        selectRecordType: {
          type: "string",
          description: "Convenience value for selectrecordtype when fieldType is SELECT or MULTISELECT."
        },
        description: { type: "string" },
        storeValue: { type: "boolean" },
        fieldValues: {
          type: "object",
          description: "Additional raw form fieldId-to-value pairs to include in the scriptcustfield.nl POST. scripttype and id are always set by the tool."
        }
      },
      required: ["scriptFieldId", "scriptInternalId"]
    }
  },
  {
    name: "netsuite_inspect_custom_record_field",
    description:
      "Load an existing NetSuite customrecordcustomfield metadata record and return its actual body field IDs, values, display text, field metadata, and fieldtype/selectrecordtype select options. " +
      "Use this to verify how custom record fields are structured in the current account before creating or debugging fields.",
    inputSchema: {
      type: "object",
      properties: {
        customFieldId: {
          type: "string",
          description: "Internal ID of a custom record field metadata record to load directly."
        },
        customRecordTypeId: {
          type: "string",
          description: "Internal ID of a custom record type. If customFieldId is omitted, the tool loads the first field on this record type or the field matching scriptId."
        },
        customRecordTypeInternalId: {
          type: "string",
          description: "Alias for customRecordTypeId."
        },
        scriptId: {
          type: "string",
          description: "Optional custom field script ID to find on customRecordTypeId, e.g. custrecord_my_field or my_field."
        }
      }
    }
  },
  {
    name: "netsuite_update_metadata_record",
    description:
      "Edit an existing NetSuite METADATA record in place with SuiteScript record.load -> setValue -> save. " +
      "Destructive: this modifies customization metadata in the account. " +
      "Handles four metadata record types via metadataType: 'customrecordtype' (custom record type definition, e.g. rename via recordname), " +
      "'customrecordcustomfield' (a custom record's field, e.g. change label or fieldtype), " +
      "'scriptcustomfield' (a script parameter), and 'script' (a script record). " +
      "Identify the target by numeric internal id, OR by scriptId (resolved to the internal id via SuiteQL; scriptid is matched case-insensitively). " +
      "Pass values as a map of metadata field id to new value, e.g. { recordname: 'New Name' } for a record type, " +
      "or { label: 'New Label', fieldtype: 'CLOBTEXT' } for a field. Returns before/after values for the changed fields. " +
      "PREFER this tool over netsuite_sdf_deploy for editing any of these four existing metadata types — it is faster and needs no object XML or redeploy. " +
      "This edits existing objects only; use netsuite_sdf_deploy to CREATE new custom records/fields/scripts or to add/remove fields and make larger structural changes.",
    inputSchema: {
      type: "object",
      properties: {
        metadataType: {
          type: "string",
          enum: ["customrecordtype", "customrecordcustomfield", "scriptcustomfield", "script"],
          description: "The SuiteScript record type to edit. Aliases accepted: customrecord->customrecordtype, customrecordfield/field->customrecordcustomfield, scriptparameter/scriptparam->scriptcustomfield."
        },
        id: {
          type: "string",
          description: "Numeric internal id of the metadata record. Provide this or scriptId."
        },
        scriptId: {
          type: "string",
          description: "Script id of the metadata record (e.g. customrecord_my_type, custrecord_my_field, custscript_my_param, customscript_my_script). Resolved to the internal id if id is omitted."
        },
        values: {
          type: "object",
          description: "Map of metadata field id to new value. Record type: { recordname, description, ... }. Field: { label, fieldtype, selectrecordtype, ... }. Script param: { label, fieldtype, ... }."
        }
      },
      required: ["metadataType", "values"]
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
      "Search the ENTIRE NetSuite File Cabinet for files matching a file name or internal FILE ID. Searches globally across all folders. " +
      "Returns matching files with id, name, folder (parent folder id), filesize, filetype, and url. " +
      "Do NOT pass a lead/customer/entity/transaction ID as `id`. If the user asks for a report/file related to a record ID (for example 'lead id 181'), use SuiteQL relationship discovery first and only use this tool with a verified File Cabinet file ID or distinctive file name. " +
      "To read the actual content of a file after finding it, call netsuite_read_file with the file id.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Exact internal File Cabinet file ID (e.g. '12345'). Do not use a lead/customer/entity/transaction ID here."
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
      "Do NOT use a lead/customer/entity/transaction record ID as fileId. Resolve related files with SuiteQL first. " +
      "Returns the file name, content type, and full text content. PDFs are extracted to text by the MCP bridge when possible; other binary files may return base64. " +
      "Works with PDFs and text-based files: .js, .json, .xml, .csv, .html, .ftl, .txt, etc.",
    inputSchema: {
      type: "object",
      properties: {
        fileId: {
          type: "string",
          description: "The internal numeric File Cabinet file ID to read (e.g. '21301'). Obtain this from a SuiteQL relationship query or from netsuite_find_file, never from a lead/customer/entity ID."
        }
      },
      required: ["fileId"]
    }
  },
  {
    name: "netsuite_create_folder",
    description:
      "Create a new folder in the NetSuite File Cabinet. Destructive: creates data. " +
      "If no parentFolderId is provided, the tool uses -15 (SuiteScripts root). Returns the new folder ID.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Folder name to create."
        },
        parentFolderId: {
          type: "number",
          description: "Parent folder internal ID. Defaults to -15 (SuiteScripts root)."
        }
      },
      required: ["name"]
    }
  },
  {
    name: "netsuite_upload_file",
    description:
      "Upload a file to the NetSuite File Cabinet. Destructive: creates a file. " +
      "When called through the local MCP server, prefer localPath/localPaths/files so the MCP server reads and encodes local files for you. " +
      "Use fileContent for generated text files or fileContentBase64 plus mimeType for already encoded binary files. " +
      "If no folderId is provided, the tool uses -15 (SuiteScripts root).",
    inputSchema: {
      type: "object",
      properties: {
        localPath: {
          type: "string",
          description: "Local filesystem path to upload. Supported by the local MCP server."
        },
        localPaths: {
          type: "array",
          items: { type: "string" },
          description: "Multiple local filesystem paths to upload. Supported by the local MCP server."
        },
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              localPath: {
                type: "string",
                description: "Local filesystem path to upload."
              },
              fileName: {
                type: "string",
                description: "Optional NetSuite file name override."
              },
              folderId: {
                type: "number",
                description: "Optional target folder override for this file."
              },
              mimeType: {
                type: "string",
                description: "Optional MIME type override."
              }
            },
            required: ["localPath"]
          },
          description: "Batch upload specs. Supported by the local MCP server."
        },
        fileName: {
          type: "string",
          description: "Name of the file to upload, e.g. my_script.js. Required only for fileContent/fileContentBase64 mode."
        },
        fileContent: {
          type: "string",
          description: "Raw text content to upload."
        },
        fileContentBase64: {
          type: "string",
          description: "Base64 content for binary files. Use instead of fileContent."
        },
        mimeType: {
          type: "string",
          description: "Optional MIME type for base64 uploads."
        },
        folderId: {
          type: "number",
          description: "Target folder internal ID. Defaults to -15 (SuiteScripts root)."
        }
      },
      required: ["fileName"]
    }
  },
  {
    name: "netsuite_update_file_content",
    description:
      "Replace the content of an existing NetSuite File Cabinet file. Destructive: modifies a file. " +
      "For text/script files, pass fileId and fileContent. fileName, folderId, and mediaType are optional and will be looked up when omitted.",
    inputSchema: {
      type: "object",
      properties: {
        fileId: {
          type: "number",
          description: "Internal ID of the File Cabinet file to update."
        },
        fileContent: {
          type: "string",
          description: "New raw text content for the file."
        },
        fileName: {
          type: "string",
          description: "Optional current file name. Looked up if omitted."
        },
        folderId: {
          type: "number",
          description: "Optional parent folder ID. Looked up if omitted."
        },
        mediaType: {
          type: "string",
          description: "Optional NetSuite media/file type such as JAVASCRIPT, PLAINTEXT, HTMLDOC, XMLDOC, JSON."
        }
      },
      required: ["fileId", "fileContent"]
    }
  },
  {
    name: "netsuite_rename_file",
    description:
      "Rename an existing File Cabinet file without changing content. Destructive: modifies file metadata.",
    inputSchema: {
      type: "object",
      properties: {
        fileId: {
          type: "number",
          description: "Internal ID of the file to rename."
        },
        newName: {
          type: "string",
          description: "New file name."
        },
        folderId: {
          type: "number",
          description: "Optional current parent folder ID. Looked up if omitted."
        }
      },
      required: ["fileId", "newName"]
    }
  },
  {
    name: "netsuite_rename_folder",
    description:
      "Rename an existing File Cabinet folder. Destructive: modifies folder metadata.",
    inputSchema: {
      type: "object",
      properties: {
        folderId: {
          type: "number",
          description: "Internal ID of the folder to rename."
        },
        newName: {
          type: "string",
          description: "New folder name."
        },
        parentFolderId: {
          type: "number",
          description: "Optional parent folder ID. Looked up if omitted."
        }
      },
      required: ["folderId", "newName"]
    }
  },
  {
    name: "netsuite_delete_file",
    description:
      "Delete a File Cabinet file. Destructive and irreversible unless NetSuite recovery applies.",
    inputSchema: {
      type: "object",
      properties: {
        fileId: {
          type: "number",
          description: "Internal ID of the file to delete."
        },
        folderId: {
          type: "number",
          description: "Optional current parent folder ID. Looked up if omitted."
        }
      },
      required: ["fileId"]
    }
  },
  {
    name: "netsuite_delete_folder",
    description:
      "Delete a File Cabinet folder. Destructive. The folder must be deletable in NetSuite.",
    inputSchema: {
      type: "object",
      properties: {
        folderId: {
          type: "number",
          description: "Internal ID of the folder to delete."
        }
      },
      required: ["folderId"]
    }
  },
  {
    name: "netsuite_move_items",
    description:
      "Move File Cabinet files and/or folders from one folder to another. Destructive: changes file/folder locations.",
    inputSchema: {
      type: "object",
      properties: {
        srcFolderId: {
          type: "number",
          description: "Source folder internal ID."
        },
        dstFolderId: {
          type: "number",
          description: "Destination folder internal ID."
        },
        fileIds: {
          type: "array",
          items: { type: "number" },
          description: "File IDs to move."
        },
        folderIds: {
          type: "array",
          items: { type: "number" },
          description: "Folder IDs to move."
        }
      },
      required: ["srcFolderId", "dstFolderId"]
    }
  },
  {
    name: "netsuite_sdf_deploy",
    description:
      "Deploy NetSuite customizations via the bundled SuiteCloud SDF deploy tool. THE tool for CREATING scripts+deployments, CUSTOM RECORD TYPES (with all their fields in one shot), and advanced PDF/HTML TEMPLATES — do not create these piecemeal with other tools. Deploying again with the same script/object IDs UPDATES the existing objects (create-or-update semantics). " +
      "For simply EDITING an already-existing customrecordtype, customrecordcustomfield, scriptcustomfield, or script (e.g. rename, change a field's label/type, tweak one property), PREFER netsuite_update_metadata_record — it is a fast in-place record.load/setValue/save that needs no object XML or full redeploy. Use SDF for those types when creating them, adding/removing fields, or making larger structural changes. " +
      "PREFER THE STRUCTURED PAYLOADS — do NOT hand-write SDF XML: (1) SCRIPT: scriptType + scriptFile + deployments; (2) customRecords: record types with their fields; (3) templates: advanced PDF/HTML templates with FreeMarker source. " +
      "The raw `objects` array (full SDF object XML) is ONLY for other object types or XML obtained from netsuite_sdf_import_object. " +
      "Runs locally against the currently selected MCP account; if that account has no SuiteCloud login yet, a browser login console opens and the user must authenticate (first call for a new account may take longer or time out — retry after login). " +
      "Script deployment defaults: RELEASED (NOTSCHEDULED for scheduled/mapreduce), DEBUG log, all internal roles for suitelet/restlet, runs as ADMINISTRATOR where supported. " +
      "Required features (CUSTOMRECORDS, ADVANCEDPRINTING, ...) are declared automatically. " +
      "Executed by the bundled companion via the MCP client (e.g. Claude Desktop); it is not available to the in-browser agent.",
    inputSchema: {
      type: "object",
      properties: {
        customRecords: {
          type: "array",
          description: "STRUCTURED custom record types to create/update (preferred over raw XML). Field types: TEXT, TEXTAREA, CLOBTEXT, CHECKBOX, INTEGER, FLOAT, CURRENCY, PERCENT, DATE, DATETIMETZ, EMAIL, PHONE, HYPERLINK, SELECT, MULTISELECT, RICHTEXT, INLINEHTML, IMAGE, DOCUMENT, PASSWORD, TIMEOFDAY (aliases: FREEFORMTEXT, LONGTEXT, DECIMAL, LIST, DATETIME).",
          items: {
            type: "object",
            properties: {
              scriptId: { type: "string", description: "e.g. customrecord_my_type (prefix added if missing)." },
              name: { type: "string", description: "Record display name (recordname)." },
              description: { type: "string" },
              includeNameField: { type: "boolean", description: "Defaults to true." },
              showId: { type: "boolean" },
              hierarchical: { type: "boolean" },
              inactive: { type: "boolean" },
              enableNumbering: { type: "boolean" },
              numberingPrefix: { type: "string" },
              fields: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    scriptId: { type: "string", description: "e.g. custrecord_my_field (prefix added if missing)." },
                    label: { type: "string" },
                    fieldType: { type: "string", description: "See list above. Defaults to TEXT." },
                    mandatory: { type: "boolean" },
                    storeValue: { type: "boolean", description: "Defaults to true." },
                    showInList: { type: "boolean", description: "Defaults to true." },
                    selectRecordType: { type: "string", description: "SELECT/MULTISELECT target: customrecord_/customlist_ scriptid (auto-wrapped) or numeric list id." },
                    isParent: { type: "boolean", description: "Marks a parent-child SELECT field." },
                    parentSubtab: { type: "string", description: "Parent record subtab ref, e.g. customrecord_parent.custrecordtab_children." },
                    defaultValue: { type: "string" },
                    defaultChecked: { type: "boolean" },
                    description: { type: "string" },
                    help: { type: "string" },
                    displayType: { type: "string", description: "NORMAL (default), HIDDEN, DISABLED, INLINE." }
                  },
                  required: ["scriptId", "label"]
                }
              },
              subtabs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    scriptId: { type: "string", description: "e.g. custrecordtab_my_tab (prefix added if missing)." },
                    title: { type: "string" }
                  },
                  required: ["scriptId", "title"]
                }
              }
            },
            required: ["scriptId", "name"]
          }
        },
        templates: {
          type: "array",
          description: "STRUCTURED advanced PDF/HTML templates to create/update (preferred over raw XML).",
          items: {
            type: "object",
            properties: {
              scriptId: { type: "string", description: "e.g. custtmpl_my_template (prefix added if missing)." },
              title: { type: "string" },
              standard: { type: "string", description: "Base standard template id, e.g. STDTMPLCUSTINVC (invoice), STDTMPLSALESORD (sales order), STDTMPLESTIMATE (quote)." },
              content: { type: "string", description: "FreeMarker template source (the <pdf>...</pdf> document)." },
              localPath: { type: "string", description: "Local file with the FreeMarker source, instead of content." },
              description: { type: "string" },
              preferred: { type: "boolean" },
              inactive: { type: "boolean" }
            },
            required: ["scriptId", "title", "standard"]
          }
        },
        objects: {
          type: "array",
          description: "Raw SDF object XML pass-through — ONLY for object types not covered by the structured payloads, or XML returned by netsuite_sdf_import_object. Root tag must carry a scriptid attribute.",
          items: {
            type: "object",
            properties: {
              xml: { type: "string", description: "Full SDF object XML, e.g. <customrecordtype scriptid=\"customrecord_x\">...</customrecordtype>." },
              template: {
                type: "object",
                description: "Template source sidecar (<scriptid>.template.xml) for advanced PDF/HTML templates.",
                properties: {
                  content: { type: "string", description: "Inline template source (FreeMarker XML)." },
                  localPath: { type: "string", description: "Absolute local path of an existing template file." }
                }
              }
            },
            required: ["xml"]
          }
        },
        scriptType: {
          type: "string",
          enum: ["suitelet", "restlet", "clientscript", "usereventscript", "scheduledscript", "mapreducescript"],
          description: "SDF script type (only for the structured script payload). Aliases accepted: scriptlet->suitelet, client->clientscript, userevent/ue->usereventscript, scheduled/ss->scheduledscript, mapreduce/mr->mapreducescript."
        },
        scriptId: {
          type: "string",
          description: "Script ID, e.g. customscript_my_script (customscript_ prefix added if missing)."
        },
        name: { type: "string", description: "Human-readable script name." },
        description: { type: "string", description: "Optional script description." },
        accountId: {
          type: "string",
          description: "Optional NetSuite account ID override, e.g. 1964539 or 9937091_SB1. Defaults to the currently selected MCP account."
        },
        scriptFile: {
          type: "object",
          description: "The SuiteScript source file. cabinetPath is the File Cabinet target path; provide content (inline source) or localPath (existing local file).",
          properties: {
            cabinetPath: { type: "string", description: "Path under the File Cabinet, e.g. SuiteScripts/MyTool/my_script.js." },
            content: { type: "string", description: "Inline JavaScript source of the script." },
            localPath: { type: "string", description: "Absolute local path of an existing .js file to upload instead of content." }
          },
          required: ["cabinetPath"]
        },
        parameters: {
          type: "array",
          description: "Optional script parameters (custscript custom fields).",
          items: {
            type: "object",
            properties: {
              scriptId: { type: "string", description: "Parameter ID, e.g. custscript_my_param." },
              label: { type: "string" },
              fieldType: { type: "string", description: "TEXT, TEXTAREA, SELECT, CHECKBOX, INTEGER, DATE, ..." },
              mandatory: { type: "boolean" },
              storeValue: { type: "boolean" },
              selectRecordType: { type: "string" },
              description: { type: "string" },
              help: { type: "string" },
              defaultValue: { type: "string" }
            },
            required: ["scriptId", "label"]
          }
        },
        deployments: {
          type: "array",
          description: "Deployments to create. At least one required for the structured script payload.",
          items: {
            type: "object",
            properties: {
              scriptId: { type: "string", description: "Deployment ID, e.g. customdeploy_my_script." },
              title: { type: "string" },
              status: { type: "string", description: "RELEASED, TESTING, or NOTSCHEDULED (scheduled/mapreduce)." },
              logLevel: { type: "string", description: "DEBUG, AUDIT, ERROR, EMERGENCY." },
              isDeployed: { type: "boolean" },
              allRoles: { type: "boolean" },
              audienceRoles: { type: "array", items: { type: "string" }, description: "Explicit role list when allRoles is false." },
              isOnline: { type: "boolean", description: "Suitelet: available without login." },
              recordType: { type: "string", description: "Client/UserEvent: record type, e.g. SALESORDER." },
              eventType: { type: "string", description: "UserEvent: CREATE, EDIT, VIEW, DELETE... blank = all." },
              executionContext: { type: "string", description: "Pipe-joined contexts, e.g. USERINTERFACE|CSVIMPORT." },
              runAsRole: { type: "string", description: "e.g. ADMINISTRATOR." },
              bufferSize: { type: "number" },
              concurrencyLimit: { type: "number" },
              queueAllStagesAtOnce: { type: "boolean" },
              yieldAfterMins: { type: "number" },
              recurrence: {
                type: "object",
                description: "Scheduled/MapReduce single-run schedule.",
                properties: {
                  type: { type: "string", enum: ["single"] },
                  startDate: { type: "string", description: "YYYY-MM-DD" },
                  startTime: { type: "string", description: "HH:mm:ssZ, e.g. 22:00:00Z" },
                  repeat: { type: "string" }
                }
              },
              parameterValues: { type: "object", description: "Deployment-level parameter values keyed by parameter scriptId." }
            },
            required: ["scriptId"]
          }
        }
      },
      required: []
    }
  },
  {
    name: "netsuite_sdf_list_objects",
    description:
      "List custom objects deployed in the currently selected NetSuite account, as {type, scriptId} entries, via the SuiteCloud SDF tool. " +
      "Use this to discover objects to import/edit with netsuite_sdf_import_object. Optionally filter by object type(s) and/or a scriptid substring. " +
      "For SDF object types see the SuiteCloud object reference (e.g. customrecordtype, advancedpdftemplate, savedsearch, role, customlist, ...). " +
      "Executed by the bundled companion via the MCP client (e.g. Claude Desktop); not available to the in-browser agent.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "array",
          items: { type: "string" },
          description: "Object type(s) to list, e.g. [\"customrecordtype\",\"advancedpdftemplate\"]. Omit to list all."
        },
        scriptId: { type: "string", description: "Only list objects whose script id contains this value." },
        accountId: { type: "string", description: "Optional account override. Defaults to the currently selected MCP account." }
      },
      required: []
    }
  },
  {
    name: "netsuite_sdf_import_object",
    description:
      "Import an existing custom object's SDF XML from the currently selected account and return it, so you can edit it and redeploy the change with netsuite_sdf_deploy (create-or-update). " +
      "OBJECTS ONLY (custom records, templates, saved searches, roles, lists, ...); script records/deployments have their own tooling and are rejected here. " +
      "For advanced PDF/HTML templates the FreeMarker source is returned as templateXml. " +
      "Workflow: import -> edit the returned xml (and templateXml) -> call netsuite_sdf_deploy with objects:[{ xml, template:{content} }] using the SAME scriptid. " +
      "Executed by the bundled companion via the MCP client (e.g. Claude Desktop); not available to the in-browser agent.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "SDF object type, e.g. customrecordtype, advancedpdftemplate, savedsearch, role, customlist." },
        scriptId: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } }
          ],
          description: "Script id(s) of the object(s) to import, e.g. customrecord_my_type."
        },
        includeTemplate: { type: "boolean", description: "Include the template source sidecar for template objects. Defaults to true." },
        accountId: { type: "string", description: "Optional account override. Defaults to the currently selected MCP account." }
      },
      required: ["type", "scriptId"]
    }
  },
  {
    name: "netsuite_run_quick_script",
    description:
      "Run a small SuiteScript/JavaScript snippet in the authenticated NetSuite page context. " +
      "Use this to quickly test N/* module calls or JavaScript expressions. Return values and console/N.log output are returned as { result, logs }. " +
      "The snippet runs inside an async function with N modules destructured, so you can use await and modules such as record, search, query, runtime, file, log.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "SuiteScript/JavaScript body to execute, e.g. \"console.log(runtime.getCurrentUser().id); return runtime.getCurrentUser().name;\""
        }
      },
      required: ["code"]
    }
  },
  {
    name: "magic_netsuite_deploy_server_components",
    description:
      "Deploy or repair the Magic NetSuite server-side components used by server Quick Script, FreeMarker rendering, and MCP Suitelet-backed tools. Returns before/after component status.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "netsuite_freemarker_preview_html",
    description:
      "Guarded FreeMarker renderer workflow, not the first step for template recreation. Use only after local BFO-safe template work and Playwright screenshot review, or when the user explicitly asks for renderer approval. If required server components are missing, this returns needsDeploymentApproval and the agent must ask the user before retrying with deployIfMissing:true.",
    inputSchema: {
      type: "object",
      properties: {
        html: { type: "string", description: "The proposed HTML preview to show to the user before FreeMarker conversion." },
        title: { type: "string", description: "Optional preview title." },
        recordType: { type: "string", description: "NetSuite record type to use later for the FreeMarker render, e.g. invoice." },
        recordId: { type: "string", description: "NetSuite internal ID to use later for the FreeMarker render." },
        deployIfMissing: { type: "boolean", description: "Only true after explicit user approval to deploy/repair renderer server components." }
      },
      required: ["html"]
    }
  },
  {
    name: "netsuite_freemarker_set_approval",
    description:
      "Mark a FreeMarker HTML preview session as approved or needing changes. Agents should only call this based on explicit user feedback from the MCP app preview.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Preview session ID returned by netsuite_freemarker_preview_html." },
        approved: { type: "boolean", description: "True when the user approves the HTML preview; false when fixes are requested." },
        feedback: { type: "string", description: "User fix notes when approved is false." }
      },
      required: ["sessionId", "approved"]
    }
  },
  {
    name: "netsuite_freemarker_approval_status",
    description:
      "Read the current approval status and feedback for a FreeMarker preview session before converting.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Preview session ID." }
      },
      required: ["sessionId"]
    }
  },
  {
    name: "netsuite_freemarker_convert_approved",
    description:
      "POST-APPROVAL ONLY. Convert an approved HTML preview session into a FreeMarker Advanced PDF template, or rerender a revised FreeMarker template from that approved session, against the selected NetSuite record.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Approved preview session ID." },
        renderPdf: { type: "boolean", description: "Render the converted FreeMarker template immediately. Defaults to true." },
        freemarker: { type: "string", description: "Optional revised FreeMarker/BFO template to render instead of regenerating it from the approved HTML." },
        recordType: { type: "string", description: "Optional record type override for the render." },
        recordId: { type: "string", description: "Optional record internal ID override for the render." }
      },
      required: ["sessionId"]
    }
  },
  {
    name: "netsuite_server_info",
    description:
      "Return server-side NetSuite runtime information from the deployed MCP Suitelet. Requires MCP Suitelet deployment URL in settings.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "netsuite_submit_task",
    description:
      "Submit a NetSuite task using the server-side N/task module from the deployed MCP Suitelet. Destructive/side-effecting depending on task type.",
    inputSchema: {
      type: "object",
      properties: {
        taskType: {
          type: "string",
          description: "N/task TaskType key or value, e.g. SCHEDULED_SCRIPT, MAP_REDUCE, CSV_IMPORT."
        },
        values: {
          type: "object",
          description: "Task object properties to assign before submit, such as scriptId, deploymentId, params, or importFile."
        }
      },
      required: ["taskType"]
    }
  },
  {
    name: "netsuite_check_task_status",
    description:
      "Check a NetSuite task status using the server-side N/task module from the deployed MCP Suitelet.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID returned by netsuite_submit_task or another NetSuite task submit call."
        }
      },
      required: ["taskId"]
    }
  },
  {
    name: "netsuite_suitelet_stream_start",
    description:
      "Start an interactive Suitelet viewer session for the MCP App. Opens the provided NetSuite Suitelet URL, or uses the preferred NetSuite tab when no URL is provided.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Optional Suitelet URL to open and stream. If omitted, the current/preferred NetSuite tab is used."
        }
      }
    }
  },
  {
    name: "netsuite_suitelet_stream_list",
    description:
      "List deployed Suitelets available in the preferred NetSuite account so the MCP App can open one in a hidden viewer tab.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional search text for Suitelet script name, script ID, or deployment ID."
        }
      }
    }
  },
  {
    name: "netsuite_suitelet_stream_frame",
    description:
      "Capture the latest screenshot frame for the active Suitelet viewer session.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "netsuite_suitelet_stream_input",
    description:
      "Send mouse, wheel, or keyboard input to the active Suitelet viewer session.",
    inputSchema: {
      type: "object",
      properties: {
        event: {
          type: "object",
          description: "Input event with type click, mousemove, wheel, keydown, or keyup. Mouse coordinates are normalized 0..1."
        }
      },
      required: ["event"]
    }
  },
  {
    name: "netsuite_suitelet_probe_url",
    description:
      "Fetch a Suitelet URL from the extension with NetSuite credentials and return diagnostics such as status, final URL, frame-blocking headers, and response hints.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Suitelet URL to diagnose."
        }
      },
      required: ["url"]
    }
  },
  {
    name: "netsuite_suitelet_fetch_html",
    description:
      "Fetch Suitelet HTML with NetSuite credentials so the MCP App can render it with srcdoc when direct iframe embedding is blank.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Suitelet URL to fetch."
        }
      },
      required: ["url"]
    }
  },
  {
    name: "netsuite_suitelet_proxy_request",
    description:
      "Proxy a Suitelet runtime fetch/XHR request through the Chrome extension with NetSuite credentials.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        method: { type: "string" },
        headers: { type: "object" },
        body: { type: "string" }
      },
      required: ["url"]
    }
  },
  {
    name: "netsuite_dump_cookies",
    description:
      "Return the current NetSuite session cookies (including HttpOnly auth cookies) read from a logged-in NetSuite browser tab via the debugger. Used to hand the real browser session to an external automated browser (Playwright) so it doesn't have to log in again. Requires a NetSuite tab to be open in the browser.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "netsuite_suitelet_control_open",
    description:
      "START HERE to drive a Suitelet. Opens it in a real NetSuite browser tab (foreground) and attaches the controller. This toolset is fully self-contained — do NOT use Claude-in-Chrome, tab-context, navigate, or any other browser/screenshot tools; use this family (inspect/fill/click/read/eval/screenshot) for everything. PREFERRED: pass { query: \"<suitelet name>\" } (e.g. \"CTK SuiteQL\") and the correct account URL is resolved automatically — never invent or guess a URL. Alternatively pass { scriptId, deployId } from netsuite_suitelet_stream_list, or a full scriptlet.nl url. Omit all to control the already-active NetSuite tab. Returns the controlled url+title, the matched Suitelet, alternatives, a screenshot, and a snapshot of visible interactive elements for fill/click/read.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suitelet name or keyword to look up and open (recommended, e.g. \"CTK SuiteQL\")." },
        scriptId: { type: "string", description: "Script internal id (use with deployId)." },
        deployId: { type: "string", description: "Deployment id (use with scriptId)." },
        url: { type: "string", description: "Full scriptlet.nl URL (only if you already have the exact account URL)." }
      }
    }
  },
  {
    name: "netsuite_suitelet_inspect",
    description:
      "List the visible interactive elements (inputs, textareas, selects, buttons, links) of the controlled Suitelet with stable CSS selectors and labels. Call before fill/click to discover targets.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "netsuite_suitelet_screenshot",
    description:
      "Capture a screenshot (image) of the controlled Suitelet tab. Use THIS to visually see the page — never use Claude-in-Chrome or other browser screenshot tools.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "netsuite_suitelet_hover",
    description:
      "Hover the mouse over an element in the controlled Suitelet (by CSS selector, or x/y viewport coordinates) and return a screenshot. Triggers native CSS :hover plus pointer/mouseover events, so tooltips, dropdown menus, and hover-reveal UI appear.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of the element to hover over." },
        x: { type: "number", description: "Viewport X coordinate (CSS px) to hover, if no selector." },
        y: { type: "number", description: "Viewport Y coordinate (CSS px) to hover, if no selector." }
      }
    }
  },
  {
    name: "netsuite_suitelet_scroll",
    description:
      "Scroll the controlled Suitelet (window, or a specific scrollable element by selector) and return a screenshot of the new view. Use to reveal content below the fold such as a results table. Omit args to page down; use to:\"bottom\"/\"top\", a dy pixel delta, or a selector to scroll an element into view.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector to scroll into view, or the scrollable container to scroll." },
        to: { type: "string", description: "\"top\" or \"bottom\" to jump to an edge." },
        dy: { type: "number", description: "Vertical pixels to scroll by (positive = down). Defaults to ~600 for window." },
        dx: { type: "number", description: "Horizontal pixels to scroll by." }
      }
    }
  },
  {
    name: "netsuite_suitelet_fill",
    description:
      "Set the value of an input/textarea/select in the controlled Suitelet by CSS selector, firing input/change events (works with framework-bound fields).",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of the field to fill." },
        value: { type: "string", description: "Value to set." }
      },
      required: ["selector"]
    }
  },
  {
    name: "netsuite_suitelet_click",
    description:
      "Click an element in the controlled Suitelet, either by CSS selector or by visible button/link text (e.g. \"Run Query\").",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of the element to click." },
        text: { type: "string", description: "Visible text of the button/link to click (used when selector is omitted)." }
      }
    }
  },
  {
    name: "netsuite_suitelet_read",
    description:
      "Read text/value from the controlled Suitelet — a specific element by CSS selector, or the whole page body when no selector is given. Use to read query results, messages, or rendered output.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector to read. Omit to read the page body text." },
        maxLength: { type: "number", description: "Max characters to return (default 8000)." }
      }
    }
  },
  {
    name: "netsuite_suitelet_eval",
    description:
      "Run a JavaScript expression or snippet in the controlled Suitelet tab and return the (JSON-serializable) result. The most flexible control primitive; prefer fill/click/read for common actions.",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "JavaScript expression or statements to evaluate in the page." }
      },
      required: ["expression"]
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

      let executionSide = "client";
      try {
        result = await callMcpSuiteletServerTool(name, args);

        if (result) {
          executionSide = "server";
        } else if (name === "netsuite_switch_environment") {
          result = await handleNetsuiteSwitchEnvironment(args);
          executionSide = "local";
        } else if (name === "ping") {
          // Include account info so agents can discover which account is targeted
          const storageForPing = await chrome.storage.sync.get(["magic_netsuite_settings"]);
          const pingAccount = storageForPing?.magic_netsuite_settings?.mcpPreferredAccount || null;
          const text = args.message ? `pong: ${args.message}` : "pong";
          const accountInfo = pingAccount ? ` (account: ${pingAccount})` : "";
          result = { content: [{ type: "text", text: text + accountInfo }] };
          executionSide = "local";
        } else if (name === "magic_netsuite_save_skill") {
          result = await handleMagicSaveSkill(args);
          executionSide = "local";
        } else if (name === "magic_netsuite_list_skills") {
          result = await handleMagicListSkills(args);
          executionSide = "local";
        } else if (name === "magic_netsuite_search_skills") {
          result = await handleMagicSearchSkills(args);
          executionSide = "local";
        } else if (name === "magic_netsuite_load_skill") {
          result = await handleMagicLoadSkill(args);
          executionSide = "local";
        } else if (name === "magic_netsuite_set_skill_enabled") {
          result = await handleMagicSetSkillEnabled(args);
          executionSide = "local";
        } else if (name === "magic_netsuite_search_custom_tools") {
          result = await handleMagicSearchCustomTools(args);
          executionSide = "local";
        } else if (name === "magic_netsuite_create_custom_tool") {
          result = await handleMagicCreateCustomTool(args);
          executionSide = "local";
        } else if (name === "magic_netsuite_update_custom_tool") {
          result = await handleMagicUpdateCustomTool(args);
          executionSide = "local";
        } else if (name === "magic_netsuite_test_custom_tool") {
          result = await handleMagicTestCustomTool(args);
          executionSide = args?.executionDomain || "client";
        } else if (name === "magic_netsuite_call_custom_tool") {
          result = await handleMagicCallCustomTool(args);
          executionSide = args?.executionDomain || "client";
        } else if (name === "suiteql_get_guide") {
          result = { content: [{ type: "text", text: SUITEQL_GUIDE }] };
          executionSide = "local";
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
        } else if (name === "netsuite_lists") {
          result = await handleNetsuiteLists(args);
        } else if (name === "netsuite_list_items") {
          result = await handleNetsuiteListItems(args);
        } else if (name === "netsuite_create_list") {
          result = await handleNetsuiteCreateList(args);
        } else if (name === "netsuite_update_list") {
          result = await handleNetsuiteUpdateList(args);
        } else if (name === "netsuite_create_record") {
          result = await handleNetsuiteCreateRecord(args);
        } else if (name === "netsuite_update_record_fields") {
          result = await handleNetsuiteUpdateRecordFields(args);
        } else if (name === "netsuite_load_record") {
          result = await handleNetsuiteLoadRecord(args);
        } else if (name === "netsuite_get_record_sublists") {
          result = await handleNetsuiteGetRecordSublists(args);
        } else if (name === "netsuite_get_record_fields") {
          result = await handleNetsuiteGetRecordFields(args);
        } else if (name === "netsuite_inspect_custom_record_field") {
          result = await handleNetsuiteInspectCustomRecordField(args);
        } else if (name === "netsuite_create_script_field") {
          result = await handleNetsuiteCreateScriptField(args);
        } else if (name === "netsuite_update_script_field") {
          result = await handleNetsuiteUpdateScriptField(args);
        } else if (name === "netsuite_update_metadata_record") {
          result = await handleNetsuiteUpdateMetadataRecord(args);
        } else if (name === "netsuite_read_file") {
          result = await handleNetsuiteReadFile(args);
        } else if (name === "netsuite_find_file") {
          result = await handleNetsuiteFindFile(args);
        } else if (name === "netsuite_find_folder") {
          result = await handleNetsuiteFindFolder(args);
        } else if (name === "netsuite_list_folder") {
          result = await handleNetsuiteListFolder(args);
        } else if (name === "netsuite_create_folder") {
          result = await handleNetsuiteCreateFolder(args);
        } else if (name === "netsuite_upload_file") {
          result = await handleNetsuiteUploadFile(args);
        } else if (name === "netsuite_update_file_content") {
          result = await handleNetsuiteUpdateFileContent(args);
        } else if (name === "netsuite_rename_file") {
          result = await handleNetsuiteRenameFile(args);
        } else if (name === "netsuite_rename_folder") {
          result = await handleNetsuiteRenameFolder(args);
        } else if (name === "netsuite_delete_file") {
          result = await handleNetsuiteDeleteFile(args);
        } else if (name === "netsuite_delete_folder") {
          result = await handleNetsuiteDeleteFolder(args);
        } else if (name === "netsuite_move_items") {
          result = await handleNetsuiteMoveItems(args);
        } else if (name === "netsuite_get_scripts") {
          result = await handleNetsuiteGetScripts(args);
        } else if (name === "netsuite_get_script_files") {
          result = await handleNetsuiteGetScriptFiles(args);
        } else if (name === "netsuite_get_deployed_scripts") {
          result = await handleNetsuiteGetDeployedScripts(args);
        } else if (
          name === "netsuite_sdf_deploy" ||
          name === "netsuite_sdf_list_objects" ||
          name === "netsuite_sdf_import_object"
        ) {
          result = await handleNetsuiteSdfDeploy(args);
        } else if (name === "netsuite_run_quick_script") {
          result = await handleNetsuiteRunQuickScript(args);
        } else if (name === "magic_netsuite_deploy_server_components") {
          result = await handleMagicDeployServerComponents();
        } else if (name === "netsuite_freemarker_preview_html") {
          result = await handleFreemarkerPreviewHtml(args);
          executionSide = "local";
        } else if (name === "netsuite_freemarker_set_approval") {
          result = await handleFreemarkerSetApproval(args);
          executionSide = "local";
        } else if (name === "netsuite_freemarker_approval_status") {
          result = await handleFreemarkerApprovalStatus(args);
          executionSide = "local";
        } else if (name === "netsuite_freemarker_convert_approved") {
          result = await handleFreemarkerConvertApproved(args);
          executionSide = "local";
        } else if (name === "netsuite_get_logs") {
          result = await handleNetsuiteGetLogs(args);
        } else if (name === "netsuite_suitelet_stream_start") {
          result = await handleSuiteletStreamStart(args);
        } else if (name === "netsuite_suitelet_stream_list") {
          result = await handleSuiteletStreamList(args);
        } else if (name === "netsuite_suitelet_stream_frame") {
          result = await handleSuiteletStreamFrame();
        } else if (name === "netsuite_suitelet_stream_input") {
          result = await handleSuiteletStreamInput(args);
        } else if (name === "netsuite_suitelet_probe_url") {
          result = await handleSuiteletProbeUrl(args);
        } else if (name === "netsuite_suitelet_fetch_html") {
          result = await handleSuiteletFetchHtml(args);
        } else if (name === "netsuite_suitelet_proxy_request") {
          result = await handleSuiteletProxyRequest(args);
        } else if (name === "netsuite_dump_cookies") {
          result = await handleDumpNetsuiteCookies();
        } else if (name === "netsuite_suitelet_control_open") {
          result = await handleSuiteletControlOpen(args);
        } else if (name === "netsuite_suitelet_inspect") {
          result = await handleSuiteletInspect(args);
        } else if (name === "netsuite_suitelet_screenshot") {
          result = await handleSuiteletScreenshot(args);
        } else if (name === "netsuite_suitelet_scroll") {
          result = await handleSuiteletScroll(args);
        } else if (name === "netsuite_suitelet_hover") {
          result = await handleSuiteletHover(args);
        } else if (name === "netsuite_suitelet_fill") {
          result = await handleSuiteletFill(args);
        } else if (name === "netsuite_suitelet_click") {
          result = await handleSuiteletClick(args);
        } else if (name === "netsuite_suitelet_read") {
          result = await handleSuiteletRead(args);
        } else if (name === "netsuite_suitelet_eval") {
          result = await handleSuiteletEval(args);
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
        recordMcpUsage(name, true, null, executionSide);

        // After a successful tool call, check governance on the dedicated tab
        // and refresh it if needed for the next call.
        // Fire-and-forget — don't block the response.
        if (!name.startsWith("netsuite_suitelet_")) {
          checkAndRefreshDedicatedTabGovernance().catch((err) => {
            console.debug(`[MCP] Post-call governance check failed: ${err.message}`);
          });
        }
      } catch (toolErr) {
        recordMcpUsage(name, false, toolErr.message, executionSide);
        throw toolErr;
      }
    } else {
      throw new Error(`Unknown method: ${method}`);
    }

    const responseStorage = await chrome.storage.sync.get(["magic_netsuite_settings"]);
    const responseAccount =
      mcpDedicatedTabAccountId ||
      responseStorage?.magic_netsuite_settings?.mcpPreferredAccount ||
      null;
    return { requestId, success: true, result, account: responseAccount };
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
async function handleNetsuiteSwitchEnvironment(args = {}) {
  const requestedAccount = String(args.accountId ?? "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
  const storageResult = await chrome.storage.sync.get(["magic_netsuite_settings"]);
  const settings = storageResult?.magic_netsuite_settings || {};

  await chrome.storage.sync.set({
    magic_netsuite_settings: {
      ...settings,
      mcpPreferredAccount: requestedAccount
    }
  });

  if (!requestedAccount) {
    const tab = await getActiveNetsuiteTab();
    return asMcpTextResult({
      switched: true,
      accountId: extractAccountIdFromUrl(tab.url),
      routing: "active-tab",
      tabId: tab.id
    });
  }

  const tab = await getPreferredNetsuiteTab();
  const resolvedAccount = extractAccountIdFromUrl(tab.url);
  if (resolvedAccount !== requestedAccount) {
    throw new Error(
      `Could not route MCP calls to account ${requestedAccount}; selected tab belongs to ${resolvedAccount || "unknown"}.`
    );
  }

  return asMcpTextResult({
    switched: true,
    accountId: resolvedAccount,
    routing: tab.id === mcpDedicatedTabId ? "dedicated-tab" : "connected-tab",
    tabId: tab.id,
    url: tab.url
  });
}

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

async function handleNetsuiteLists(args) {
  const result = await callNetsuiteRoute(
    "GET_CUSTOM_LISTS",
    {
      query: args?.query ?? "",
      includeInactive: args?.includeInactive === true
    },
    "Failed to get custom lists."
  );

  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2)
    }]
  };
}

async function handleNetsuiteListItems(args) {
  const listId = String(args?.listId ?? "").trim();
  if (!listId) throw new Error("listId is required.");

  const result = await callNetsuiteRoute(
    "GET_CUSTOM_LIST_ITEMS",
    {
      listId,
      includeInactive: args?.includeInactive === true
    },
    `Failed to get custom list items for ${listId}.`
  );

  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2)
    }]
  };
}

async function handleNetsuiteCreateList(args) {
  const name = String(args?.name ?? "").trim();
  const scriptId = String(args?.scriptId ?? args?.scriptid ?? "").trim();
  const values = args?.values ?? args?.listValues;
  if (!name) throw new Error("name is required.");
  if (!scriptId) throw new Error("scriptId is required.");
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("values must contain at least one custom list value.");
  }

  const result = await callNetsuiteRoute(
    "CREATE_CUSTOM_LIST",
    { ...args, name, scriptId, values },
    "Failed to create custom list."
  );

  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2)
    }]
  };
}

async function handleNetsuiteUpdateList(args) {
  const listId = String(args?.listId ?? args?.id ?? "").trim();
  if (!listId) throw new Error("listId is required.");

  const result = await callNetsuiteRoute(
    "UPDATE_CUSTOM_LIST",
    { ...args, listId },
    "Failed to update custom list."
  );

  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2)
    }]
  };
}

async function handleNetsuiteCreateRecord(args) {
  const recordType = String(args?.recordType ?? args?.type ?? "").trim();
  if (!recordType) throw new Error("recordType is required.");

  const result = await callNetsuiteRoute(
    "CREATE_RECORD",
    {
      ...args,
      recordType
    },
    `Failed to create record ${recordType}.`
  );

  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2)
    }]
  };
}

async function handleNetsuiteUpdateRecordFields(args) {
  const recordType = String(args?.recordType ?? args?.type ?? "").trim();
  const recordId = String(args?.recordId ?? args?.id ?? "").trim();
  if (!recordType) throw new Error("recordType is required.");
  if (!recordId) throw new Error("recordId is required.");

  const result = await callNetsuiteRoute(
    "UPDATE_RECORD_FIELDS",
    {
      ...args,
      recordType,
      recordId
    },
    `Failed to update record ${recordType}/${recordId}.`
  );

  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2)
    }]
  };
}

function getRouteResult(response, fallbackMessage) {
  if (!response || response.status === "error") {
    const rawMsg = response?.message ?? response?.error;
    const errMsg = rawMsg
      ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg))
      : fallbackMessage;
    throw new Error(errMsg);
  }

  return response.message ?? response;
}

async function callNetsuiteRoute(action, data, fallbackMessage) {
  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  const response = await sendMessageToTab(tab.id, {
    action,
    data,
    mode: "normal"
  });

  return getRouteResult(response, fallbackMessage);
}

async function handleNetsuiteInspectCustomRecordField(args) {
  const result = await callNetsuiteRoute(
    "INSPECT_CUSTOM_RECORD_FIELD",
    args,
    "Failed to inspect custom record field."
  );
  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2)
    }]
  };
}

async function handleNetsuiteCreateScriptField(args) {
  const result = await callNetsuiteRoute(
    "CREATE_SCRIPT_FIELD",
    args,
    "Failed to create script field."
  );
  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2)
    }]
  };
}

async function handleNetsuiteUpdateScriptField(args) {
  const scriptFieldId = String(args?.scriptFieldId ?? args?.fieldId ?? args?.id ?? "").trim();
  const scriptInternalId = String(args?.scriptInternalId ?? args?.scriptRecordId ?? args?.parentScriptId ?? "").trim();
  if (!scriptFieldId) throw new Error("scriptFieldId is required.");
  if (!scriptInternalId) throw new Error("scriptInternalId is required.");

  const result = await callNetsuiteRoute(
    "UPDATE_SCRIPT_FIELD",
    {
      ...args,
      scriptFieldId,
      scriptInternalId
    },
    "Failed to update script field."
  );
  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2)
    }]
  };
}

async function handleNetsuiteUpdateMetadataRecord(args) {
  const metadataType = String(args?.metadataType ?? args?.type ?? "").trim();
  const id = String(args?.id ?? "").trim();
  const scriptId = String(args?.scriptId ?? "").trim();
  if (!metadataType) throw new Error("metadataType is required.");
  if (!id && !scriptId) throw new Error("Provide id (numeric internal id) or scriptId.");
  if (!args?.values || typeof args.values !== "object" || Array.isArray(args.values)) {
    throw new Error("values must be an object mapping metadata field IDs to values.");
  }

  const result = await callNetsuiteRoute(
    "UPDATE_METADATA_RECORD",
    { ...args, metadataType, ...(id ? { id } : {}), ...(scriptId ? { scriptId } : {}) },
    "Failed to update metadata record."
  );
  return asMcpTextResult(result);
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
  const fileRows = Array.isArray(files) ? files : (files?.results ?? []);
  const totalCount = Array.isArray(files)
    ? fileRows.length
    : (files?.totalCount ?? fileRows.length);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        count: totalCount,
        files,
        ...(
          id && !name && totalCount === 0
            ? {
                hint:
                  "No File Cabinet file has that internal ID. If this number came from a lead/customer/entity/transaction request, it is a record ID; use SuiteQL relationship discovery to find the linked file ID."
              }
            : {}
        )
      }, null, 2)
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

async function lookupFileCabinetFile(fileId) {
  const idNum = parseInt(String(fileId ?? ""), 10);
  if (isNaN(idNum)) throw new Error("fileId must be a numeric file ID.");

  const result = await callNetsuiteRoute(
    "RUN_SUITEQL_QUERY",
    {
      sql: `SELECT id, name, folder, filetype, filesize, url FROM file WHERE id = ${idNum} AND ROWNUM <= 1`,
      limit: 1
    },
    `Failed to look up file ${fileId}.`
  );
  const rows = Array.isArray(result) ? result : (result?.results ?? []);
  const file = rows[0];
  if (!file) throw new Error(`File with ID ${fileId} not found.`);
  return file;
}

async function lookupFileCabinetFolder(folderId) {
  const idNum = parseInt(String(folderId ?? ""), 10);
  if (isNaN(idNum)) throw new Error("folderId must be a numeric folder ID.");

  const result = await callNetsuiteRoute(
    "RUN_SUITEQL_QUERY",
    {
      sql: `SELECT id, name, parent FROM MediaItemFolder WHERE id = ${idNum} AND ROWNUM <= 1`,
      limit: 1
    },
    `Failed to look up folder ${folderId}.`
  );
  const rows = Array.isArray(result) ? result : (result?.results ?? []);
  const folder = rows[0];
  if (!folder) throw new Error(`Folder with ID ${folderId} not found.`);
  return folder;
}

function asMcpTextResult(result) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2)
    }]
  };
}

async function callMcpSuiteletServerTool(name, args) {
  if (!MCP_SERVER_SIDE_TOOL_NAMES.has(name)) return null;

  const storageResult = await chrome.storage.sync.get(["magic_netsuite_settings"]);
  const overrideUrl = String(storageResult?.magic_netsuite_settings?.mcpSuiteletDeploymentUrl || "").trim();
  const suiteletUrl = overrideUrl || await resolveMcpSuiteletServerUrl();
  if (!suiteletUrl) return null;

  const body = new URLSearchParams();
  body.set("action", "mcpToolCall");
  body.set("name", name);
  body.set("arguments", JSON.stringify(args || {}));

  const response = await fetch(suiteletUrl, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    throw new Error(`MCP Suitelet server route failed with HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  if (payload?.unsupported) return null;
  if (payload?.ok === undefined) return null;
  if (!payload?.ok) {
    const raw = payload?.error;
    throw new Error(raw ? (typeof raw === "string" ? raw : JSON.stringify(raw)) : "MCP Suitelet server route failed.");
  }
  return payload.result;
}

async function resolveMcpSuiteletServerUrl() {
  if (mcpSuiteletServerUrlCache?.url && Date.now() - mcpSuiteletServerUrlCache.at < 60000) {
    return mcpSuiteletServerUrlCache.url;
  }

  const { suitelets } = await querySuitelets(MAGIC_NETSUITE_SERVER_SCRIPT_ID);
  const matched = suitelets.find((suitelet) =>
    String(suitelet.scriptId || "").toLowerCase() === MAGIC_NETSUITE_SERVER_SCRIPT_ID ||
    String(suitelet.deploymentScriptId || "").toLowerCase() === MAGIC_NETSUITE_SERVER_DEPLOYMENT_SCRIPT_ID
  ) || suitelets[0];

  if (!matched?.url) return "";
  mcpSuiteletServerUrlCache = { url: matched.url, at: Date.now(), matched };
  return matched.url;
}

async function handleNetsuiteCreateFolder(args) {
  const name = String(args?.name ?? "").trim();
  if (!name) throw new Error("name is required.");

  const result = await callNetsuiteRoute(
    "CREATE_FOLDER",
    {
      name,
      parentFolder: args?.parentFolderId ?? -15
    },
    "Failed to create folder."
  );
  return asMcpTextResult(result);
}

async function handleNetsuiteUploadFile(args) {
  if (
    (args?.localPath || args?.path || args?.localPaths || args?.files) &&
    args?.fileContent === undefined &&
    args?.fileContentBase64 === undefined
  ) {
    throw new Error(
      "localPath uploads must be sent through the local MCP server. The Chrome extension cannot read local filesystem paths directly."
    );
  }

  const fileName = String(args?.fileName ?? "").trim();
  if (!fileName) throw new Error("fileName is required.");
  if (args?.fileContent === undefined && args?.fileContentBase64 === undefined) {
    throw new Error("Either fileContent or fileContentBase64 is required.");
  }

  const result = await callNetsuiteRoute(
    "UPLOAD_FILE",
    {
      fileName,
      fileContent: args.fileContent,
      fileContentBase64: args.fileContentBase64,
      mimeType: args.mimeType,
      folderId: args.folderId ?? -15
    },
    "Failed to upload file."
  );
  return asMcpTextResult(result);
}

async function handleNetsuiteUpdateFileContent(args) {
  const fileId = parseInt(String(args?.fileId ?? ""), 10);
  if (isNaN(fileId)) throw new Error("fileId must be a numeric file ID.");
  if (args?.fileContent === undefined) throw new Error("fileContent is required.");

  const file = (!args.fileName || !args.folderId || !args.mediaType)
    ? await lookupFileCabinetFile(fileId)
    : null;

  const result = await callNetsuiteRoute(
    "UPDATE_FILE_CONTENT",
    {
      fileId,
      fileContent: args.fileContent,
      fileName: args.fileName ?? file?.name ?? `file_${fileId}`,
      folderId: args.folderId ?? file?.folder,
      mediaType: args.mediaType ?? file?.filetype ?? "JAVASCRIPT"
    },
    `Failed to update file ${fileId}.`
  );
  return asMcpTextResult(result);
}

async function handleNetsuiteRenameFile(args) {
  const fileId = parseInt(String(args?.fileId ?? ""), 10);
  if (isNaN(fileId)) throw new Error("fileId must be a numeric file ID.");
  const newName = String(args?.newName ?? "").trim();
  if (!newName) throw new Error("newName is required.");

  const file = (!args.folderId || !args.filetype || !args.filesize)
    ? await lookupFileCabinetFile(fileId)
    : null;

  const result = await callNetsuiteRoute(
    "RENAME_FILE",
    {
      fileId,
      newName,
      folderId: args.folderId ?? file?.folder,
      filetype: args.filetype ?? file?.filetype,
      filesize: args.filesize ?? file?.filesize
    },
    `Failed to rename file ${fileId}.`
  );
  return asMcpTextResult(result);
}

async function handleNetsuiteRenameFolder(args) {
  const folderId = parseInt(String(args?.folderId ?? ""), 10);
  if (isNaN(folderId)) throw new Error("folderId must be a numeric folder ID.");
  const newName = String(args?.newName ?? "").trim();
  if (!newName) throw new Error("newName is required.");

  const folder = args.parentFolderId === undefined
    ? await lookupFileCabinetFolder(folderId)
    : null;

  const result = await callNetsuiteRoute(
    "RENAME_FOLDER",
    {
      folderId,
      newName,
      parentFolderId: args.parentFolderId ?? folder?.parent ?? -15
    },
    `Failed to rename folder ${folderId}.`
  );
  return asMcpTextResult(result);
}

async function handleNetsuiteDeleteFile(args) {
  const fileId = parseInt(String(args?.fileId ?? ""), 10);
  if (isNaN(fileId)) throw new Error("fileId must be a numeric file ID.");
  const file = args.folderId === undefined ? await lookupFileCabinetFile(fileId) : null;

  const result = await callNetsuiteRoute(
    "DELETE_FILE",
    {
      fileId,
      folderId: args.folderId ?? file?.folder
    },
    `Failed to delete file ${fileId}.`
  );
  return asMcpTextResult({ fileId, result });
}

async function handleNetsuiteDeleteFolder(args) {
  const folderId = parseInt(String(args?.folderId ?? ""), 10);
  if (isNaN(folderId)) throw new Error("folderId must be a numeric folder ID.");

  const result = await callNetsuiteRoute(
    "DELETE_FOLDER",
    { folderId },
    `Failed to delete folder ${folderId}.`
  );
  return asMcpTextResult({ folderId, result: result ?? "success" });
}

async function handleNetsuiteMoveItems(args) {
  const srcFolderId = parseInt(String(args?.srcFolderId ?? ""), 10);
  const dstFolderId = parseInt(String(args?.dstFolderId ?? ""), 10);
  if (isNaN(srcFolderId)) throw new Error("srcFolderId must be numeric.");
  if (isNaN(dstFolderId)) throw new Error("dstFolderId must be numeric.");

  const result = await callNetsuiteRoute(
    "MOVE_ITEMS",
    {
      srcFolderId,
      dstFolderId,
      fileIds: Array.isArray(args?.fileIds) ? args.fileIds : [],
      folderIds: Array.isArray(args?.folderIds) ? args.folderIds : []
    },
    "Failed to move File Cabinet items."
  );
  return asMcpTextResult(result);
}

// netsuite_sdf_deploy executes in the bundled sdfDeploy companion, spawned by
// the MCP server (magiNetsuiteMCPServer.js) for MCP-client calls. It never
// reaches the extension over the bridge. This in-browser stub only exists so
// the tool appears in the MCP server view and returns a clear message if the
// in-browser agent (which cannot spawn the SuiteCloud CLI) tries to run it.
async function handleNetsuiteSdfDeploy() {
  throw new Error(
    "The SDF tools (netsuite_sdf_deploy / netsuite_sdf_list_objects / " +
    "netsuite_sdf_import_object) run through the bundled SuiteCloud SDF " +
    "companion, launched by the MCP server (e.g. Claude Desktop). They are " +
    "not available to the in-browser agent."
  );
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

async function handleNetsuiteRunQuickScript(args) {
  const code = String(args?.code ?? "").trim();
  if (!code) throw new Error("code is required.");

  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  const response = await sendMessageToTab(tab.id, {
    action: "RUN_QUICK_SCRIPT",
    data: { code, mode: "normal" },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    const rawMsg = response?.message;
    throw new Error(rawMsg ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg)) : "Failed to run quick script");
  }

  return { content: [{ type: "text", text: JSON.stringify(response.message, null, 2) }] };
}

async function handleMagicDeployServerComponents() {
  const result = await callNetsuiteRoute(
    "DEPLOY_SERVER_COMPONENTS",
    {},
    "Failed to deploy Magic NetSuite server components."
  );
  return asMcpTextResult(result);
}

function makeFreemarkerSessionId() {
  return `fm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getFreemarkerSession(sessionId) {
  const id = String(sessionId ?? "").trim();
  if (!id) throw new Error("sessionId is required.");
  const session = freemarkerPreviewSessions.get(id);
  if (!session) throw new Error(`FreeMarker preview session "${id}" was not found.`);
  return session;
}

function summarizeFreemarkerSession(session, includeHtml = false) {
  return {
    sessionId: session.sessionId,
    title: session.title,
    recordType: session.recordType,
    recordId: session.recordId,
    status: session.status,
    approved: session.approved,
    feedback: session.feedback,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(includeHtml ? { html: session.html } : {}),
    ...(session.freemarker ? { freemarker: session.freemarker } : {}),
    ...(session.renderResult ? { renderResult: session.renderResult } : {})
  };
}

function normalizePreviewHtml(html, title = "FreeMarker Preview") {
  const source = String(html ?? "").trim();
  if (!source) throw new Error("html is required.");
  if (/<!doctype\s+html|<html[\s>]/i.test(source)) return source;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtmlText(title)}</title>
</head>
<body>
${source}
</body>
</html>`;
}

function escapeHtmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractHtmlBody(html) {
  const bodyMatch = String(html).match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return (bodyMatch ? bodyMatch[1] : String(html))
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .trim();
}

function extractHtmlStyles(html) {
  const styles = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = re.exec(String(html)))) {
    if (match[1]?.trim()) styles.push(match[1].trim());
  }
  return styles.join("\n\n");
}

function htmlToFreemarkerPdf(html, { title = "FreeMarker Template" } = {}) {
  const body = extractHtmlBody(html) || "<div></div>";
  const styles = extractHtmlStyles(html);
  return `<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
  <head>
    <title>${escapeHtmlText(title)}</title>${styles ? `
    <style type="text/css">
${styles}
    </style>` : ""}
  </head>
  <body size="Letter">
${body}
  </body>
</pdf>`;
}

function isRendererReady(status) {
  if (!status || typeof status !== "object") return false;
  if (status.allReady === true || status.ready === true || status.isReady === true) return true;
  const components = Array.isArray(status.components) ? status.components : [];
  return components.length > 0 && components.every(component =>
    component?.ready === true ||
    component?.exists === true ||
    component?.status === "ready" ||
    component?.status === "deployed"
  );
}

async function ensureFreemarkerRendererReady(deployIfMissing) {
  const before = await callNetsuiteRoute(
    "CHECK_SERVER_COMPONENTS",
    {},
    "Failed to check Magic NetSuite server components."
  );

  if (isRendererReady(before)) return { ready: true, before, after: before };

  if (!deployIfMissing) {
    return {
      ready: false,
      needsDeploymentApproval: true,
      before,
      message:
        "FreeMarker renderer server components are not deployed. Ask the user whether to deploy them. If the user refuses, stop. If approved, call this tool again with deployIfMissing:true."
    };
  }

  const deployed = await callNetsuiteRoute(
    "DEPLOY_SERVER_COMPONENTS",
    {},
    "Failed to deploy Magic NetSuite server components."
  );
  const after = await callNetsuiteRoute(
    "CHECK_SERVER_COMPONENTS",
    {},
    "Failed to verify Magic NetSuite server components after deployment."
  );
  return { ready: isRendererReady(after), before, deployed, after };
}

async function handleFreemarkerPreviewHtml(args = {}) {
  const title = String(args.title ?? "FreeMarker Preview").trim() || "FreeMarker Preview";
  const readiness = await ensureFreemarkerRendererReady(args.deployIfMissing === true);

  if (!readiness.ready) {
    return asMcpTextResult({
      ok: false,
      needsDeploymentApproval: true,
      message: readiness.message || "FreeMarker renderer server components are not ready.",
      readiness
    });
  }

  const html = normalizePreviewHtml(args.html, title);
  const now = new Date().toISOString();
  const session = {
    sessionId: makeFreemarkerSessionId(),
    title,
    html,
    recordType: String(args.recordType ?? "").trim(),
    recordId: String(args.recordId ?? "").trim(),
    status: "pending_approval",
    approved: false,
    feedback: "",
    createdAt: now,
    updatedAt: now
  };
  freemarkerPreviewSessions.set(session.sessionId, session);

  return asMcpTextResult({
    ok: true,
    ...summarizeFreemarkerSession(session, true),
    instructions:
      "Show this HTML preview to the user. If approved, call netsuite_freemarker_set_approval with approved:true, then netsuite_freemarker_convert_approved. If fixes are requested, set approved:false with feedback and regenerate the HTML preview."
  });
}

async function handleFreemarkerSetApproval(args = {}) {
  const session = getFreemarkerSession(args.sessionId);
  const approved = args.approved === true;
  const feedback = String(args.feedback ?? "").trim();
  session.approved = approved;
  session.feedback = feedback;
  session.status = approved ? "approved" : "needs_changes";
  session.updatedAt = new Date().toISOString();
  freemarkerPreviewSessions.set(session.sessionId, session);
  return asMcpTextResult({
    ok: true,
    ...summarizeFreemarkerSession(session),
    nextStep: approved
      ? "Call netsuite_freemarker_convert_approved to convert the approved HTML."
      : "Use feedback to revise the HTML, then create a new preview session."
  });
}

async function handleFreemarkerApprovalStatus(args = {}) {
  const session = getFreemarkerSession(args.sessionId);
  return asMcpTextResult({
    ok: true,
    ...summarizeFreemarkerSession(session, true)
  });
}

async function handleFreemarkerConvertApproved(args = {}) {
  const session = getFreemarkerSession(args.sessionId);
  if (!session.approved) {
    return asMcpTextResult({
      ok: false,
      sessionId: session.sessionId,
      status: session.status,
      approved: session.approved,
      feedback: session.feedback,
      message: "Conversion is blocked until the user approves the HTML preview."
    });
  }

  const recordType = String(args.recordType ?? session.recordType ?? "").trim();
  const recordId = String(args.recordId ?? session.recordId ?? "").trim();
  const renderPdf = args.renderPdf !== false;
  const freemarkerOverride = String(args.freemarker ?? "").trim();
  const freemarker = freemarkerOverride || htmlToFreemarkerPdf(session.html, { title: session.title });
  let renderResult = null;

  if (renderPdf) {
    if (!recordType || !recordId) {
      throw new Error("recordType and recordId are required to render the approved FreeMarker template.");
    }
    renderResult = await callNetsuiteRoute(
      "RENDER_FREEMARKER_TEMPLATE",
      { template: freemarker, recordType, recordId },
      "Failed to render approved FreeMarker template."
    );
  }

  session.freemarker = freemarker;
  session.renderResult = renderResult;
  session.recordType = recordType;
  session.recordId = recordId;
  session.status = renderPdf ? "rendered" : "converted";
  session.updatedAt = new Date().toISOString();
  freemarkerPreviewSessions.set(session.sessionId, session);

  return asMcpTextResult({
    ok: true,
    ...summarizeFreemarkerSession(session),
    freemarker,
    renderResult
  });
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
// Suitelet Viewer Stream Tools
// -----------------------------
let suiteletStreamSession = null;
let suiteletDebuggerAttached = false;
const SUITELET_DEBUGGER_PROTOCOL_VERSION = "1.3";

function normalizeSuiteletViewerUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";

  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Suitelet viewer URL must be http or https.");
  }
  if (!/\.netsuite\.com$/i.test(url.hostname)) {
    throw new Error("Suitelet viewer only supports NetSuite URLs.");
  }
  return url.href;
}

function waitForTabLoaded(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for Suitelet tab to load."));
    }, timeoutMs);

    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab);
    };

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || done) return;
      if (tab?.status === "complete") {
        done = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    });
  });
}

async function focusSuiteletStreamTab(tab) {
  if (!tab?.id || !tab.windowId) throw new Error("Suitelet stream tab is unavailable.");
  await dashboardWindowsUpdate(tab.windowId, { focused: true });
  await dashboardTabsUpdate(tab.id, { active: true });
}

function getTabOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

async function getSuiteletViewport(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0,
        title: document.title || ""
      })
    });
    return result?.result || { width: 1280, height: 720, devicePixelRatio: 1, scrollX: 0, scrollY: 0, title: "" };
  } catch {
    return { width: 1280, height: 720, devicePixelRatio: 1, scrollX: 0, scrollY: 0, title: "" };
  }
}

async function ensureSuiteletDebugger(tabId) {
  if (suiteletDebuggerAttached && suiteletStreamSession?.tabId === tabId) return;
  await chrome.debugger.attach({ tabId }, SUITELET_DEBUGGER_PROTOCOL_VERSION);
  suiteletDebuggerAttached = true;
  await chrome.debugger.sendCommand({ tabId }, "Page.enable", {}).catch(() => null);
}

async function sendSuiteletDebuggerCommand(tabId, method, params) {
  await ensureSuiteletDebugger(tabId);
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

// Read the live NetSuite session cookies (incl. HttpOnly auth cookies) so
// Playwright can reuse the real browser session instead of logging in again.
// Uses chrome.cookies (needs the "cookies" permission) — NOT the debugger — so
// it does not flash the "… is in debug mode" banner and needs no open tab.
const SAME_SITE_MAP = { no_restriction: "None", lax: "Lax", strict: "Strict" };

async function handleDumpNetsuiteCookies() {
  // Pick the account the SAME way the MCP bridge does: getPreferredNetsuiteTab()
  // honors the mcpPreferredAccount setting (falls back to the active NS tab).
  // Then dump ONLY that account's cookies via getAll({url}), which returns the
  // cookies that would be sent to that origin (its host cookies + shared
  // .netsuite.com) and EXCLUDES other logged-in accounts' host cookies.
  let origin = "";
  try {
    const tab = await getPreferredNetsuiteTab();
    if (tab?.url) origin = getTabOrigin(tab.url);
  } catch { /* fall back below */ }

  const raw = origin
    ? await chrome.cookies.getAll({ url: `${origin}/` })
    : await chrome.cookies.getAll({ domain: "netsuite.com" });

  const cookies = (raw || []).map((c) => {
    const out = {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || "/",
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure)
    };
    if (!c.session && typeof c.expirationDate === "number") {
      out.expires = Math.floor(c.expirationDate);
    }
    const sameSite = SAME_SITE_MAP[c.sameSite];
    if (sameSite) out.sameSite = sameSite;
    return out;
  });

  if (!cookies.length) {
    throw new Error("No NetSuite cookies found. Log into NetSuite in your browser first.");
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ ok: true, origin, count: cookies.length, cookies }, null, 2)
    }]
  };
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (suiteletStreamSession?.tabId === tabId) {
    suiteletStreamSession = null;
    suiteletDebuggerAttached = false;
  }
});

chrome.debugger.onDetach.addListener((source) => {
  if (suiteletStreamSession?.tabId === source.tabId) {
    suiteletDebuggerAttached = false;
  }
});

async function handleSuiteletStreamStart(args) {
  const requestedUrl = normalizeSuiteletViewerUrl(args?.url);
  const previousTabId = suiteletStreamSession?.tabId || null;
  const openActive = args?.active === true;
  let tab;

  if (requestedUrl) {
    tab = await dashboardTabsCreate({ url: requestedUrl, active: openActive });
    await waitForTabLoaded(tab.id).catch(() => null);
  } else {
    tab = await getPreferredNetsuiteTab();
    if (!tab) throw new Error("No suitable NetSuite tab found. Open a Suitelet or pass a Suitelet URL.");
  }

  if (!tab?.id || !tab.windowId) {
    throw new Error("Could not start Suitelet stream: no tab was available.");
  }

  const freshTab = await dashboardTabsGet(tab.id);
  if (previousTabId && previousTabId !== tab.id && suiteletDebuggerAttached) {
    await chrome.debugger.detach({ tabId: previousTabId }).catch(() => null);
  }
  suiteletStreamSession = {
    tabId: tab.id,
    windowId: tab.windowId,
    url: freshTab.url || requestedUrl,
    startedAt: new Date().toISOString(),
    latestFrame: null
  };
  suiteletDebuggerAttached = previousTabId === tab.id && suiteletDebuggerAttached;

  const viewport = await getSuiteletViewport(tab.id);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        ok: true,
        session: suiteletStreamSession,
        viewport
      }, null, 2)
    }]
  };
}

// Shared deployed-Suitelet lookup. Returns { origin, suitelets } where each
// suitelet carries a real, account-correct scriptlet.nl URL.
async function querySuitelets(query) {
  const normalized = String(query || "").trim().toLowerCase();
  const tab = await getPreferredNetsuiteTab();
  if (!tab) throw new Error("No suitable NetSuite tab found. Make sure a NetSuite page is open.");

  const conditions = [
    "UPPER(script.scripttype) = UPPER('SCRIPTLET')",
    "scriptdeployment.isdeployed = 'T'"
  ];

  if (normalized) {
    const escaped = normalized.replace(/'/g, "''");
    const searchParts = [
      `LOWER(script.name) LIKE LOWER('%${escaped}%')`,
      `LOWER(script.scriptid) LIKE LOWER('%${escaped}%')`,
      `LOWER(scriptdeployment.scriptid) LIKE LOWER('%${escaped}%')`
    ];

    if (/^\d+$/.test(normalized)) {
      searchParts.push(`script.id = ${Number(normalized)}`);
      searchParts.push(`scriptdeployment.deploymentid = ${Number(normalized)}`);
    }

    conditions.push(`(
      ${searchParts.join("\n      OR ")}
    )`);
  }

  // ROWNUM is assigned BEFORE ORDER BY in SuiteQL/Oracle, so ordering + capping in
  // the same SELECT returns an arbitrary slice. Order in a subquery, cap outside.
  const sql = `
    SELECT * FROM (
      SELECT
        script.id AS scriptinternalid,
        script.scriptid AS scriptscriptid,
        script.name AS scriptname,
        scriptdeployment.primarykey AS deploymentrecordid,
        scriptdeployment.deploymentid,
        scriptdeployment.scriptid AS deploymentscriptid,
        scriptdeployment.status,
        scriptdeployment.isdeployed
      FROM scriptdeployment
      INNER JOIN script ON scriptdeployment.script = script.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY script.name, scriptdeployment.deploymentid
    ) WHERE ROWNUM <= 1000
  `;

  const response = await sendMessageToTab(tab.id, {
    action: "RUN_SUITEQL_QUERY",
    data: { sql, limit: 1000 },
    mode: "normal"
  });

  if (!response || response.status === "error") {
    const rawMsg = response?.message;
    throw new Error(rawMsg ? (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg)) : "Failed to fetch Suitelets");
  }

  const origin = getTabOrigin(tab.url);
  const rows = Array.isArray(response.message) ? response.message : (response.message?.results ?? []);
  const suitelets = rows
    .map((row) => {
      const scriptId = String(row.scriptinternalid || row.scriptInternalId || row.id || "");
      const deployId = String(row.deploymentid || row.deploymentId || "").trim();
      const deploymentRecordId = String(row.deploymentrecordid || row.deploymentRecordId || row.primarykey || "").trim();
      const scriptName = String(row.scriptname || row.scriptName || "Suitelet");
      const deploymentScriptId = String(row.deploymentscriptid || row.deploymentScriptId || "");
      const scriptScriptId = String(row.scriptscriptid || row.scriptScriptId || row.scriptid || "");
      return {
        scriptInternalId: scriptId,
        scriptId: scriptScriptId,
        scriptName,
        deploymentId: deployId,
        deploymentRecordId,
        deploymentScriptId,
        status: String(row.status || ""),
        url: origin && scriptId && deployId
          ? `${origin}/app/site/hosting/scriptlet.nl?script=${encodeURIComponent(scriptId)}&deploy=${encodeURIComponent(deployId)}`
          : ""
      };
    })
    .filter((suitelet) => suitelet.url)
    .slice(0, 1000);

  return { origin, suitelets };
}

async function handleSuiteletStreamList(args) {
  const { suitelets } = await querySuitelets(args?.query);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ count: suitelets.length, suitelets }, null, 2)
    }]
  };
}

// Resolve what to open for control: an explicit scriptlet URL, a scriptId+deployId,
// or a name/query lookup. Never lets the caller invent a host.
async function resolveSuiteletTarget(args) {
  const rawUrl = String(args?.url || "").trim();
  if (rawUrl) {
    let parsed;
    try { parsed = new URL(rawUrl); } catch { throw new Error(`Invalid Suitelet URL: ${rawUrl}`); }
    if (!/\.app\.netsuite\.com$/i.test(parsed.hostname) || parsed.pathname !== "/app/site/hosting/scriptlet.nl") {
      throw new Error(
        `Refusing to open "${rawUrl}" — not a Suitelet (expected an <account>.app.netsuite.com/app/site/hosting/scriptlet.nl URL). ` +
        `Pass { query: "<name>" } or { scriptId, deployId } instead and the URL will be resolved for you.`
      );
    }
    return { url: parsed.href, matched: null, alternatives: [] };
  }

  const scriptId = String(args?.scriptId ?? args?.scriptInternalId ?? "").trim();
  const deployId = String(args?.deployId ?? args?.deploymentId ?? "").trim();
  if (/^\d+$/.test(scriptId) && /^\d+$/.test(deployId)) {
    const tab = await getPreferredNetsuiteTab();
    const origin = tab ? getTabOrigin(tab.url) : "";
    if (!origin) throw new Error("No NetSuite tab open to resolve the account URL. Open a NetSuite page first.");
    return { url: `${origin}/app/site/hosting/scriptlet.nl?script=${scriptId}&deploy=${deployId}`, matched: null, alternatives: [] };
  }

  const query = String(args?.query ?? args?.name ?? "").trim();
  if (query) {
    const { suitelets } = await querySuitelets(query);
    if (!suitelets.length) throw new Error(`No deployed Suitelet matches "${query}".`);
    return {
      url: suitelets[0].url,
      matched: suitelets[0],
      alternatives: suitelets.slice(1, 6).map((s) => ({ scriptName: s.scriptName, scriptInternalId: s.scriptInternalId, deploymentId: s.deploymentId, url: s.url }))
    };
  }

  return { url: "", matched: null, alternatives: [] }; // fall back to active tab
}

async function handleSuiteletProbeUrl(args) {
  const rawUrl = String(args?.url || "").trim();
  if (!rawUrl) throw new Error("url is required.");

  const targetUrl = new URL(rawUrl);
  if (!/\.netsuite\.com$/i.test(targetUrl.hostname)) {
    throw new Error("Suitelet probe only supports NetSuite URLs.");
  }

  const response = await fetch(targetUrl.href, {
    method: "GET",
    credentials: "include",
    redirect: "follow"
  });

  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const body = await response.text();
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]
    ?.replace(/\s+/g, " ")
    .trim() || "";
  const bodyText = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  const csp = headers["content-security-policy"] || "";
  const xFrameOptions = headers["x-frame-options"] || "";
  const frameBlockedByHeaders = Boolean(
    xFrameOptions ||
    /frame-ancestors/i.test(csp)
  );
  const looksLikeLogin = /login|system\.netsuite|email address|password|compid/i.test(`${title} ${bodyText}`);
  const looksEmpty = body.trim().length < 200;

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        requestedUrl: targetUrl.href,
        finalUrl: response.url,
        redirected: response.redirected,
        headers,
        title,
        bodyLength: body.length,
        bodyPreview: bodyText,
        hints: {
          frameBlockedByHeaders,
          xFrameOptions: xFrameOptions || null,
          frameAncestors: /frame-ancestors([^;]+)/i.exec(csp)?.[0] || null,
          looksLikeLogin,
          looksEmpty
        }
      }, null, 2)
    }]
  };
}

function suiteletProxyBootstrapScript(originalUrl = "") {
  let originalHash = "";
  const baselineParams = {};
  try {
    const parsed = new URL(String(originalUrl));
    originalHash = parsed.hash || "";
    // Preserve the Suitelet identity params so that relative runtime requests
    // (e.g. fetch("?action=x")) that resolve against the <base> URL and would
    // otherwise drop script/deploy/compid don't 404.
    ["script", "deploy", "compid"].forEach((key) => {
      const value = parsed.searchParams.get(key);
      if (value != null && value !== "") baselineParams[key] = value;
    });
  } catch {}
  const hashScript = originalHash
    ? `try { if (!window.location.hash) window.location.hash = ${JSON.stringify(originalHash)}; } catch (e) {}`
    : "";

  let nsOrigin = "";
  try { nsOrigin = new URL(String(originalUrl)).origin; } catch {}

  return `
<script>
(function magicNetsuiteSuiteletProxy() {
  ${hashScript}
  var BASELINE_PARAMS = ${JSON.stringify(baselineParams)};
  var NS_BASE = ${JSON.stringify(String(originalUrl))};
  var NS_ORIGIN = ${JSON.stringify(nsOrigin)};
  var EMBED_PARAMS = { ifrmcntnr: "T", popup: "T", whence: "" };
  var REQUEST_TYPE = "MAGIC_NS_SRC_PROXY_FETCH";
  var RESPONSE_TYPE = "MAGIC_NS_SRC_PROXY_FETCH_RESPONSE";
  var LOG_TYPE = "MAGIC_NS_SRC_PROXY_LOG";
  var nextId = 0;
  var pending = {};

  function proxyLog(level, message) {
    try {
      window.parent.postMessage({ type: LOG_TYPE, level: level, message: String(message) }, "*");
    } catch (e) {}
    try { (level === "error" ? console.error : level === "warn" ? console.warn : console.log)("[magic-ns] " + message); } catch (e) {}
  }

  proxyLog("info", "Suitelet proxy bootstrap installed. baseURI=" + (document.baseURI || location.href) + " hash=" + (location.hash || "(none)"));

  // In a srcdoc iframe, window.location and the document origin are the MCP host
  // (e.g. claudemcpcontent.com), NOT NetSuite — and the host strips our <base>.
  // So both the SPA (which builds URLs from location.pathname/search) and
  // NetSuite's own framework (absolute "/app/..." paths) target the wrong host
  // and 404. mapToNetsuite() rewrites any host-origin / location-derived request
  // back onto the real NetSuite origin so it can be proxied with credentials.
  // The embedder URL (what document.baseURI points at, e.g.
  // claudemcpcontent.com/mcp_apps). In a srcdoc frame window.location is
  // about:srcdoc, so we MUST key off baseURI, not location.
  var EMBEDDER_ORIGIN = "";
  var EMBEDDER_PATH = "";
  var EMBEDDER_PARAM_KEYS = {};
  try {
    var embedder = new URL(document.baseURI);
    EMBEDDER_ORIGIN = embedder.origin;
    EMBEDDER_PATH = embedder.pathname;
    embedder.searchParams.forEach(function(_v, k) { EMBEDDER_PARAM_KEYS[k] = true; });
  } catch (e) {}

  // NetSuite asset/handler paths that should keep their path and just swap origin.
  function looksLikeNetsuitePath(pathname) {
    return /^\\/(app|assets|javascript|core|services|rest|c\\.|site)\\b/i.test(pathname) ||
      /\\.(nl|jsp|js|css|png|jpe?g|gif|svg|woff2?|ttf|json|map)$/i.test(pathname);
  }

  function mapToNetsuite(value) {
    var raw = String(value || "");
    var abs;
    try { abs = new URL(raw, document.baseURI || location.href); }
    catch (e) { return raw; }

    // Non-http schemes (data:, blob:, javascript:, about:) pass through untouched.
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return abs.href;
    // Already pointed at NetSuite.
    if (/\\.netsuite\\.com$/i.test(abs.hostname)) return abs.href;
    if (!NS_ORIGIN || !NS_BASE) return abs.href;

    var sameAsEmbedder = EMBEDDER_ORIGIN && abs.origin === EMBEDDER_ORIGIN;

    // SPA api calls are built from location.pathname/search + "&action=<x>". Because
    // the srcdoc location is about:srcdoc, that base is garbage — but the tell-tale
    // "action=" survives. Rebuild the call on the real Suitelet URL, carrying the
    // action (and any other params the SPA appended that aren't embedder params).
    var actionMatch = raw.match(/[?&]action=([^&#]*)/i);
    var isAssetPath = looksLikeNetsuitePath(abs.pathname);
    if (actionMatch && (sameAsEmbedder || !isAssetPath)) {
      try {
        var spaUrl = new URL(NS_BASE);
        abs.searchParams.forEach(function(val, key) {
          if (!EMBEDDER_PARAM_KEYS[key]) spaUrl.searchParams.set(key, val);
        });
        spaUrl.searchParams.set("action", decodeURIComponent(actionMatch[1]));
        return spaUrl.href;
      } catch (e) {}
    }

    // Absolute-path NetSuite resources aimed at the embedder origin: swap origin.
    if (sameAsEmbedder) {
      try {
        var resourceUrl = new URL(NS_ORIGIN);
        resourceUrl.pathname = abs.pathname;
        resourceUrl.search = abs.search;
        resourceUrl.hash = abs.hash;
        return resourceUrl.href;
      } catch (e) {}
    }
    return abs.href;
  }

  // Back-compat alias: every caller now resolves through the NetSuite mapper.
  function absoluteUrl(value) {
    return mapToNetsuite(value);
  }

  window.addEventListener("error", function(event) {
    proxyLog("error", "Page error: " + (event && event.message ? event.message : "unknown") + (event && event.filename ? " @ " + event.filename + ":" + event.lineno : ""));
  });
  window.addEventListener("unhandledrejection", function(event) {
    var reason = event && event.reason ? (event.reason.message || event.reason) : "unknown";
    proxyLog("error", "Unhandled promise rejection: " + reason);
  });
  window.addEventListener("hashchange", function() {
    proxyLog("info", "hashchange → " + (location.hash || "(none)"));
  });
  window.addEventListener("beforeunload", function() {
    proxyLog("warn", "Page is navigating/unloading (href=" + location.href + "). A full navigation leaves the proxied srcdoc document and usually causes a blank panel.");
  });

  function shouldProxy(value) {
    try {
      var url = new URL(absoluteUrl(value));
      return /\.netsuite\.com$/i.test(url.hostname);
    } catch (e) {
      return false;
    }
  }

  function shouldPatchUrl(value) {
    try {
      var url = new URL(absoluteUrl(value));
      return (
        /\.netsuite\.com$/i.test(url.hostname) &&
        (
          url.pathname === "/app/site/hosting/scriptlet.nl" ||
          url.pathname === "/app/common/scripting/nlapijsonhandler.nl"
        )
      );
    } catch (e) {
      return false;
    }
  }

  function withEmbedParams(value) {
    try {
      var url = new URL(absoluteUrl(value));
      if (!shouldPatchUrl(url.href)) return url.href;
      // Only scriptlet.nl needs the identity params re-applied; the JSON handler
      // carries its own routing in the body.
      if (url.pathname === "/app/site/hosting/scriptlet.nl") {
        Object.keys(BASELINE_PARAMS).forEach(function(key) {
          if (!url.searchParams.has(key) || url.searchParams.get(key) === "") {
            url.searchParams.set(key, BASELINE_PARAMS[key]);
          }
        });
      }
      Object.keys(EMBED_PARAMS).forEach(function(key) {
        if (!url.searchParams.has(key)) url.searchParams.set(key, EMBED_PARAMS[key]);
      });
      return url.href;
    } catch (e) {
      return absoluteUrl(value);
    }
  }

  function hasHeader(headers, name) {
    name = String(name).toLowerCase();
    return Object.keys(headers || {}).some(function(key) { return key.toLowerCase() === name; });
  }

  function normalizeBodyAndHeaders(body, headers) {
    headers = headers || {};
    if (body == null) return { body: null, headers: headers };
    if (typeof body === "string") return { body: body, headers: headers };
    if (body instanceof URLSearchParams) {
      if (!hasHeader(headers, "content-type")) headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      return { body: body.toString(), headers: headers };
    }
    if (body instanceof FormData) {
      var params = new URLSearchParams();
      body.forEach(function(value, key) {
        params.append(key, value instanceof File ? value.name : String(value));
      });
      if (!hasHeader(headers, "content-type")) headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      return { body: params.toString(), headers: headers };
    }
    if (body instanceof Blob || body instanceof ArrayBuffer) {
      return { unsupported: true, body: null, headers: headers };
    }
    return { body: String(body), headers: headers };
  }

  function patchForms() {
    try {
      Array.prototype.forEach.call(document.querySelectorAll("form"), function(form) {
        var action = form.getAttribute("action") || location.href;
        if (shouldPatchUrl(action)) form.setAttribute("action", withEmbedParams(action));
      });
    } catch (e) {}
  }

  function proxyRequest(payload) {
    return new Promise(function(resolve, reject) {
      var id = "src-proxy-" + Date.now() + "-" + (++nextId);
      var timer = setTimeout(function() {
        delete pending[id];
        reject(new Error("Suitelet proxy request timed out."));
      }, 45000);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      window.parent.postMessage({ type: REQUEST_TYPE, id: id, payload: payload }, "*");
    });
  }

  window.addEventListener("message", function(event) {
    var data = event.data || {};
    if (data.type !== RESPONSE_TYPE || !pending[data.id]) return;
    var entry = pending[data.id];
    clearTimeout(entry.timer);
    delete pending[data.id];
    if (data.response && data.response.ok) entry.resolve(data.response);
    else entry.reject(new Error((data.response && data.response.error) || "Suitelet proxy request failed."));
  });

  var nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function(input, init) {
      var inputUrl = input && input.url ? input.url : input;
      var fetchMethod = (init && init.method) || (input && input.method) || "GET";
      if (!shouldProxy(inputUrl)) {
        proxyLog("info", "fetch passthrough (not NetSuite): " + fetchMethod + " " + absoluteUrl(inputUrl));
        return nativeFetch.apply(this, arguments);
      }
      init = init || {};
      var headers = {};
      try { new Headers(init.headers || (input && input.headers)).forEach(function(value, key) { headers[key] = value; }); } catch (e) {}
      var normalized = normalizeBodyAndHeaders(init.body == null ? null : init.body, headers);
      if (normalized.unsupported) {
        proxyLog("warn", "fetch passthrough (unsupported body type, cannot proxy): " + fetchMethod + " " + absoluteUrl(inputUrl));
        return nativeFetch.apply(this, arguments);
      }
      proxyLog("info", "fetch intercepted: " + fetchMethod + " " + withEmbedParams(inputUrl));
      return proxyRequest({
        url: withEmbedParams(inputUrl),
        originalUrl: absoluteUrl(inputUrl),
        source: "fetch",
        method: init.method || (input && input.method) || "GET",
        headers: normalized.headers,
        body: normalized.body
      }).then(function(response) {
        proxyLog(
          (response.status || 0) >= 400 ? "warn" : "info",
          "fetch result " + (response.status || "?") + " " + (response.statusText || "") + " (" + ((response.body || "").length) + " bytes) " + (response.url || withEmbedParams(inputUrl))
        );
        return new Response(response.body || "", {
          status: response.status || 200,
          statusText: response.statusText || "OK",
          headers: response.headers || {}
        });
      }).catch(function(error) {
        proxyLog("error", "fetch proxy failed: " + (error && error.message ? error.message : error) + " for " + withEmbedParams(inputUrl));
        throw error;
      });
    };
  }

  var NativeXHR = window.XMLHttpRequest;
  function ProxyXHR() {
    this._listeners = {};
    this._headers = {};
    this.readyState = 0;
    this.status = 0;
    this.statusText = "";
    this.responseText = "";
    this.response = "";
    this.responseURL = "";
  }
  ProxyXHR.UNSENT = 0; ProxyXHR.OPENED = 1; ProxyXHR.HEADERS_RECEIVED = 2; ProxyXHR.LOADING = 3; ProxyXHR.DONE = 4;
  ProxyXHR.prototype.open = function(method, url, async) {
    this._method = method || "GET";
    this._originalUrl = absoluteUrl(url);
    this._url = withEmbedParams(url);
    this._proxy = shouldProxy(this._url);
    if (!this._proxy) {
      proxyLog("info", "XHR passthrough (not NetSuite): " + this._method + " " + this._url);
      this._native = new NativeXHR();
      wireNative(this);
      return this._native.open.apply(this._native, arguments);
    }
    proxyLog("info", "XHR intercepted: " + this._method + " " + this._url);
    this.readyState = 1;
    this._emit("readystatechange");
  };
  ProxyXHR.prototype.setRequestHeader = function(name, value) {
    if (this._native) return this._native.setRequestHeader(name, value);
    this._headers[name] = value;
  };
  ProxyXHR.prototype.send = function(body) {
    var self = this;
    if (this._native) return this._native.send(body);
    var normalized = normalizeBodyAndHeaders(body, this._headers);
    if (normalized.unsupported) {
      self.status = 0;
      self.statusText = "Unsupported Suitelet proxy request body.";
      self.readyState = 4;
      self._emit("readystatechange");
      self._emit("error");
      self._emit("loadend");
      return;
    }
    proxyRequest({ url: this._url, originalUrl: this._originalUrl, source: "xhr", method: this._method, headers: normalized.headers, body: normalized.body })
      .then(function(response) {
        self.status = response.status || 200;
        self.statusText = response.statusText || "OK";
        self.responseText = response.body || "";
        try {
          self.response = self.responseType === "json" ? JSON.parse(self.responseText || "null") : self.responseText;
        } catch (e) {
          self.response = self.responseText;
        }
        self.responseURL = response.url || self._url;
        self.readyState = 4;
        proxyLog(
          self.status >= 400 ? "warn" : "info",
          "XHR result " + self.status + " " + self.statusText + " (" + self.responseText.length + " bytes) " + self.responseURL
        );
        self._emit("readystatechange");
        self._emit("load");
        self._emit("loadend");
      })
      .catch(function(error) {
        self.status = 0;
        self.statusText = error.message || "Suitelet proxy request failed.";
        self.readyState = 4;
        proxyLog("error", "XHR proxy failed: " + self.statusText + " for " + self._url);
        self._emit("readystatechange");
        self._emit("error");
        self._emit("loadend");
      });
  };
  ProxyXHR.prototype.addEventListener = function(type, listener) {
    (this._listeners[type] || (this._listeners[type] = [])).push(listener);
    if (this._native) this._native.addEventListener(type, listener);
  };
  ProxyXHR.prototype.removeEventListener = function(type, listener) {
    this._listeners[type] = (this._listeners[type] || []).filter(function(item) { return item !== listener; });
    if (this._native) this._native.removeEventListener(type, listener);
  };
  ProxyXHR.prototype.abort = function() { if (this._native) return this._native.abort(); this._emit("abort"); };
  ProxyXHR.prototype.getResponseHeader = function() { return this._native ? this._native.getResponseHeader.apply(this._native, arguments) : null; };
  ProxyXHR.prototype.getAllResponseHeaders = function() { return this._native ? this._native.getAllResponseHeaders.apply(this._native, arguments) : ""; };
  ProxyXHR.prototype._emit = function(type) {
    var event = new Event(type);
    if (typeof this["on" + type] === "function") this["on" + type](event);
    (this._listeners[type] || []).forEach(function(listener) { listener.call(this, event); }, this);
  };
  function wireNative(proxy) {
    ["readystatechange", "load", "error", "abort", "loadend"].forEach(function(type) {
      proxy._native.addEventListener(type, function(event) {
        proxy.readyState = proxy._native.readyState;
        proxy.status = proxy._native.status;
        proxy.statusText = proxy._native.statusText;
        proxy.responseText = proxy._native.responseText;
        proxy.response = proxy._native.response;
        proxy.responseURL = proxy._native.responseURL;
        proxy._emit(type, event);
      });
    });
  }
  window.XMLHttpRequest = ProxyXHR;

  // Fragment anchors (<a href="#/providers">) resolve against document.baseURI,
  // which in a srcdoc frame is the embedder URL — so a click triggers a FULL
  // navigation to claudemcpcontent.com/...#/providers and blanks the panel.
  // Intercept them and perform a same-document hash change instead, which is
  // what the SPA's hashchange router actually listens for.
  document.addEventListener("click", function(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var anchor = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!anchor) return;
    var href = anchor.getAttribute("href");
    if (!href || href.charAt(0) !== "#") return;
    event.preventDefault();
    try {
      if (("#" + location.hash.replace(/^#/, "")) === href || location.hash === href) {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } else {
        location.hash = href;
      }
      proxyLog("info", "Hash nav → " + href);
    } catch (e) {
      proxyLog("error", "Hash nav failed for " + href + ": " + (e && e.message ? e.message : e));
    }
  }, true);

  document.addEventListener("submit", function(event) {
    if (!event || !event.target) return;
    var form = event.target;
    var action = form.getAttribute && (form.getAttribute("action") || location.href);
    if (action && shouldPatchUrl(action)) form.setAttribute("action", withEmbedParams(action));
  }, true);
  patchForms();
  try {
    new MutationObserver(patchForms).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
</script>`;
}

function absolutizeSuiteletUrl(value, baseUrl) {
  try {
    return new URL(decodeHtmlAttribute(String(value)), baseUrl).href;
  } catch {
    return String(value || "");
  }
}

function decodeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function rewriteCssUrls(css, cssUrl) {
  return String(css || "").replace(/url\((['"]?)(?!data:|https?:|#)([^'")]+)\1\)/gi, (_match, quote, value) => {
    return `url(${quote}${absolutizeSuiteletUrl(value, cssUrl)}${quote})`;
  });
}

async function fetchTextForSuiteletRender(resourceUrl) {
  const targetUrl = new URL(resourceUrl);
  const allowedAssetHosts = new Set([
    "cdn.datatables.net",
    "maxcdn.bootstrapcdn.com",
    "stackpath.bootstrapcdn.com",
    "code.jquery.com",
    "cdnjs.cloudflare.com"
  ]);
  const allowed =
    /\.netsuite\.com$/i.test(targetUrl.hostname) ||
    allowedAssetHosts.has(targetUrl.hostname.toLowerCase());
  if (!allowed) {
    throw new Error(`Blocked render resource host: ${targetUrl.hostname}`);
  }
  const response = await fetch(targetUrl.href, {
    method: "GET",
    credentials: "include",
    redirect: "follow"
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return {
    url: response.url || targetUrl.href,
    text: await response.text()
  };
}

async function inlineSuiteletAssets(html, finalUrl) {
  let output = String(html || "");
  const stats = {
    stylesheetsFound: 0,
    stylesheetsInlined: 0,
    scriptsFound: 0,
    scriptsInlined: 0,
    failures: []
  };

  const stylesheetPattern = /<link\b([^>]*?rel=["'][^"']*stylesheet[^"']*["'][^>]*?)>/gi;
  output = await replaceAsync(output, stylesheetPattern, async (match, attrs) => {
    stats.stylesheetsFound += 1;
    const href = /href=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href) return match;
    const resourceUrl = absolutizeSuiteletUrl(href, finalUrl);
    try {
      const fetched = await fetchTextForSuiteletRender(resourceUrl);
      stats.stylesheetsInlined += 1;
      return `<style data-magic-inline-source="${fetched.url.replace(/"/g, "&quot;")}">${rewriteCssUrls(fetched.text, fetched.url)}</style>`;
    } catch (error) {
      stats.failures.push({ type: "stylesheet", url: resourceUrl, error: String(error?.message || error) });
      return `<!-- Magic NetSuite failed to inline stylesheet ${resourceUrl}: ${String(error?.message || error)} -->${match}`;
    }
  });

  const scriptPattern = /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi;
  output = await replaceAsync(output, scriptPattern, async (match, before, src, after) => {
    stats.scriptsFound += 1;
    const resourceUrl = absolutizeSuiteletUrl(src, finalUrl);
    try {
      const fetched = await fetchTextForSuiteletRender(resourceUrl);
      stats.scriptsInlined += 1;
      return `<script${before}${after} data-magic-inline-source="${fetched.url.replace(/"/g, "&quot;")}">\n${fetched.text}\n//# sourceURL=${fetched.url}\n</script>`;
    } catch (error) {
      stats.failures.push({ type: "script", url: resourceUrl, error: String(error?.message || error) });
      return `<!-- Magic NetSuite failed to inline script ${resourceUrl}: ${String(error?.message || error)} -->${match}`;
    }
  });

  return { html: output, stats };
}

async function replaceAsync(source, pattern, replacer) {
  const parts = [];
  let lastIndex = 0;
  for (const match of source.matchAll(pattern)) {
    parts.push(source.slice(lastIndex, match.index));
    parts.push(await replacer(...match));
    lastIndex = match.index + match[0].length;
  }
  parts.push(source.slice(lastIndex));
  return parts.join("");
}

async function prepareSuiteletHtmlForSrcdoc(html, finalUrl, originalUrl = finalUrl) {
  const baseTag = `<base href="${String(finalUrl).replace(/"/g, "&quot;")}">`;
  const inlined = await inlineSuiteletAssets(html, finalUrl);
  let output = inlined.html;

  // CSP delivered inside the HTML can block srcdoc rendering in the MCP app even
  // when the network response itself is valid.
  output = output.replace(/<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/gi, "");
  output = output.replace(/<meta[^>]+http-equiv=["']x-frame-options["'][^>]*>/gi, "");

  if (/<head[^>]*>/i.test(output)) {
    return {
      html: output.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${suiteletProxyBootstrapScript(originalUrl)}`),
      stats: inlined.stats
    };
  }
  return {
    html: `${baseTag}${suiteletProxyBootstrapScript(originalUrl)}${output}`,
    stats: inlined.stats
  };
}

async function handleSuiteletFetchHtml(args) {
  const rawUrl = String(args?.url || "").trim();
  if (!rawUrl) throw new Error("url is required.");

  const targetUrl = new URL(rawUrl);
  if (!/\.netsuite\.com$/i.test(targetUrl.hostname)) {
    throw new Error("Suitelet HTML fetch only supports NetSuite URLs.");
  }

  const response = await fetch(targetUrl.href, {
    method: "GET",
    credentials: "include",
    redirect: "follow"
  });
  const html = await response.text();
  const prepared = await prepareSuiteletHtmlForSrcdoc(html, response.url || targetUrl.href, targetUrl.href);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        requestedUrl: targetUrl.href,
        finalUrl: response.url,
        html: prepared.html,
        htmlLength: prepared.html.length,
        assetStats: prepared.stats
      }, null, 2)
    }]
  };
}

async function handleSuiteletProxyRequest(args) {
  const rawUrl = String(args?.url || "").trim();
  if (!rawUrl) throw new Error("url is required.");

  const targetUrl = new URL(rawUrl);
  if (!/\.netsuite\.com$/i.test(targetUrl.hostname)) {
    throw new Error("Suitelet proxy only supports NetSuite URLs.");
  }

  const cleanHeaders = {};
  const forbiddenHeaders = new Set([
    "accept-encoding",
    "connection",
    "content-length",
    "cookie",
    "host",
    "origin",
    "referer",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site"
  ]);

  Object.entries(args?.headers || {}).forEach(([key, value]) => {
    if (!key || value == null) return;
    if (forbiddenHeaders.has(String(key).toLowerCase())) return;
    cleanHeaders[key] = String(value);
  });

  const response = await fetch(targetUrl.href, {
    method: String(args?.method || "GET"),
    headers: cleanHeaders,
    body: args?.body == null ? undefined : String(args.body),
    credentials: "include",
    redirect: "follow"
  });

  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  const responseBody = await response.text();
  const responsePreview = responseBody
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        ok: true,
        requestedUrl: targetUrl.href,
        originalUrl: String(args?.originalUrl || ""),
        source: String(args?.source || ""),
        rewritten: Boolean(args?.originalUrl && String(args.originalUrl) !== targetUrl.href),
        requestMethod: String(args?.method || "GET"),
        requestBodyLength: args?.body == null ? 0 : String(args.body).length,
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        contentType: responseHeaders["content-type"] || "",
        headers: responseHeaders,
        bodyLength: responseBody.length,
        bodyPreview: response.status >= 400 ? responsePreview : "",
        body: responseBody
      }, null, 2)
    }]
  };
}

async function handleSuiteletStreamFrame() {
  if (!suiteletStreamSession?.tabId || !suiteletStreamSession.windowId) {
    throw new Error("No Suitelet stream session is active. Start one from the MCP app first.");
  }

  const tab = await dashboardTabsGet(suiteletStreamSession.tabId);
  const viewport = await getSuiteletViewport(suiteletStreamSession.tabId);
  suiteletStreamSession.url = tab.url || suiteletStreamSession.url;
  const screenshot = await sendSuiteletDebuggerCommand(
    suiteletStreamSession.tabId,
    "Page.captureScreenshot",
    {
      format: "jpeg",
      quality: 58,
      optimizeForSpeed: true,
      fromSurface: true,
      captureBeyondViewport: false
    }
  );
  const capturedAt = new Date().toISOString();

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        ok: true,
        dataUrl: `data:image/jpeg;base64,${screenshot?.data || ""}`,
        url: tab.url || suiteletStreamSession.url,
        title: tab.title || viewport.title || "Suitelet",
        capturedAt,
        transport: "cdp-screenshot-fallback",
        viewport
      }, null, 2)
    }]
  };
}

async function dispatchSuiteletSyntheticInput(tabId, event, x, y) {
  return chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: ({ event, x, y }) => {
      const target = document.elementFromPoint(x, y) || document.body || document.documentElement;
      if (!target) return false;

      if (event.type === "wheel") {
        target.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          deltaX: Number(event.deltaX || 0),
          deltaY: Number(event.deltaY || 0)
        }));
        return true;
      }

      if (event.type === "mousemove") {
        target.dispatchEvent(new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y
        }));
        return true;
      }

      target.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0
      }));
      target.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0
      }));
      if (typeof target.click === "function") target.click();
      return true;
    },
    args: [{ event, x, y }]
  });
}

async function handleSuiteletStreamInput(args) {
  if (!suiteletStreamSession?.tabId) {
    throw new Error("No Suitelet stream session is active. Start one from the MCP app first.");
  }

  const event = args?.event || {};
  const type = String(event.type || "");
  const tabId = suiteletStreamSession.tabId;
  const viewport = await getSuiteletViewport(tabId);
  const x = Math.max(0, Math.min(1, Number(event.x ?? 0))) * Number(viewport.width || 1280);
  const y = Math.max(0, Math.min(1, Number(event.y ?? 0))) * Number(viewport.height || 720);

  try {
    if (type === "click") {
      await sendSuiteletDebuggerCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: "left",
        clickCount: 1
      });
      await sendSuiteletDebuggerCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        clickCount: 1
      });
    } else if (type === "mousemove") {
      await sendSuiteletDebuggerCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y
      });
    } else if (type === "wheel") {
      await sendSuiteletDebuggerCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x,
        y,
        deltaX: Number(event.deltaX || 0),
        deltaY: Number(event.deltaY || 0)
      });
    } else if (type === "keydown" || type === "keyup") {
      await sendSuiteletDebuggerCommand(tabId, "Input.dispatchKeyEvent", {
        type: type === "keydown" ? "keyDown" : "keyUp",
        key: String(event.key || ""),
        code: String(event.code || ""),
        text: type === "keydown" && String(event.key || "").length === 1 ? String(event.key) : undefined,
        windowsVirtualKeyCode: Number(event.keyCode || 0)
      });
    } else {
      throw new Error(`Unsupported Suitelet input event: ${type}`);
    }
  } catch (error) {
    if (type === "click" || type === "wheel" || type === "mousemove") {
      await dispatchSuiteletSyntheticInput(tabId, event, x, y);
    } else {
      throw error;
    }
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ ok: true, type, x, y }, null, 2)
    }]
  };
}

// -----------------------------
// Suitelet programmatic control (CDP Runtime.evaluate on the real NetSuite tab)
// -----------------------------

function requireSuiteletControlTab() {
  if (!suiteletStreamSession?.tabId) {
    throw new Error("No Suitelet control session is active. Open one first with magic_netsuite_suitelet_control_open.");
  }
  return suiteletStreamSession.tabId;
}

// Runs a JS expression in the controlled Suitelet tab and returns its value.
async function evalInSuiteletTab(expression, { awaitPromise = true } = {}) {
  const tabId = requireSuiteletControlTab();
  await ensureSuiteletDebugger(tabId);
  await chrome.debugger.sendCommand({ tabId }, "Runtime.enable", {}).catch(() => null);
  const result = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true,
    allowUnsafeEvalBlockedByCSP: true
  });
  if (result?.exceptionDetails) {
    const ex = result.exceptionDetails;
    throw new Error(ex.exception?.description || ex.text || "Suitelet evaluation error");
  }
  return result?.result?.value;
}

const SUITELET_INSPECT_EXPRESSION = `(function () {
  function visible(el) {
    var rect = el.getBoundingClientRect();
    var style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }
  function selectorFor(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    if (el.getAttribute("name")) return el.tagName.toLowerCase() + "[name=\\"" + el.getAttribute("name") + "\\"]";
    if (el.getAttribute("data-input-id")) return el.tagName.toLowerCase() + "[data-input-id=\\"" + el.getAttribute("data-input-id") + "\\"]";
    var path = [];
    var node = el;
    while (node && node.nodeType === 1 && path.length < 5) {
      var part = node.tagName.toLowerCase();
      var parent = node.parentNode;
      if (parent && parent.children) {
        var idx = Array.prototype.indexOf.call(parent.children, node) + 1;
        part += ":nth-child(" + idx + ")";
      }
      path.unshift(part);
      if (node.id) { path[0] = "#" + CSS.escape(node.id); break; }
      node = node.parentNode;
    }
    return path.join(" > ");
  }
  var nodes = Array.prototype.slice.call(
    document.querySelectorAll("input, textarea, select, button, a[href], [role=button], [onclick], .ddarrowSpan, .uir-field-dropdown-arrow, [data-input-id], .uir-field-wrapper[data-nsps-label]")
  );
  var out = [];
  for (var i = 0; i < nodes.length && out.length < 120; i++) {
    var el = nodes[i];
    if (!visible(el)) continue;
    var labelledBy = el.getAttribute("aria-labelledby") ? document.getElementById(el.getAttribute("aria-labelledby")) : null;
    var fieldWrapper = el.closest ? el.closest(".uir-field-wrapper[data-nsps-label]") : null;
    out.push({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") || "",
      id: el.id || "",
      name: el.getAttribute("name") || "",
      selector: selectorFor(el),
      label: (el.innerText || el.value || el.placeholder || el.getAttribute("aria-label") || (labelledBy && labelledBy.innerText) || el.getAttribute("title") || el.getAttribute("data-nsps-label") || (fieldWrapper && fieldWrapper.getAttribute("data-nsps-label")) || "").trim().slice(0, 100)
    });
  }
  return { title: document.title, url: location.href, count: out.length, elements: out };
})()`;

// Bring the controlled Suitelet tab to the foreground so the user can watch.
async function focusSuiteletControlTab() {
  const tabId = suiteletStreamSession?.tabId;
  if (!tabId) return;
  try {
    await dashboardTabsUpdate(tabId, { active: true });
    const tab = await dashboardTabsGet(tabId);
    if (tab?.windowId) {
      await dashboardWindowsUpdate(tab.windowId, { focused: true });
    }
  } catch (e) { /* tab may have closed; ignore */ }
}

async function handleSuiteletControlOpen(args) {
  // Resolve the real account-correct URL — never trust a caller-invented host.
  const target = await resolveSuiteletTarget(args);
  // Open in the foreground so the execution is visible to the user.
  await handleSuiteletStreamStart({ url: target.url, active: true });
  const tabId = requireSuiteletControlTab();
  await ensureSuiteletDebugger(tabId);
  await chrome.debugger.sendCommand({ tabId }, "Runtime.enable", {}).catch(() => null);
  await focusSuiteletControlTab();

  let snapshot = null;
  try { snapshot = await evalInSuiteletTab(SUITELET_INSPECT_EXPRESSION); } catch (e) { snapshot = { error: String(e?.message || e) }; }

  let screenshotData = "";
  try {
    const shot = await sendSuiteletDebuggerCommand(tabId, "Page.captureScreenshot", {
      format: "jpeg",
      quality: 60,
      fromSurface: true,
      captureBeyondViewport: false
    });
    screenshotData = shot?.data || "";
  } catch (e) { /* screenshot is best-effort */ }

  const tab = await dashboardTabsGet(tabId).catch(() => null);
  const content = [{
    type: "text",
    text: JSON.stringify({
      ok: true,
      session: suiteletStreamSession,
      controlledUrl: tab?.url || suiteletStreamSession?.url || "",
      controlledTitle: tab?.title || "",
      matched: target.matched,
      alternatives: target.alternatives,
      snapshot
    }, null, 2)
  }];
  if (screenshotData) {
    content.push({ type: "image", data: screenshotData, mimeType: "image/jpeg" });
  }
  return { content };
}

async function handleSuiteletInspect() {
  const snapshot = await evalInSuiteletTab(SUITELET_INSPECT_EXPRESSION);
  return { content: [{ type: "text", text: JSON.stringify({ ok: true, ...snapshot }, null, 2) }] };
}

async function captureSuiteletScreenshotData(tabId) {
  try {
    const shot = await sendSuiteletDebuggerCommand(tabId, "Page.captureScreenshot", {
      format: "jpeg",
      quality: 60,
      fromSurface: true,
      captureBeyondViewport: false
    });
    return shot?.data || "";
  } catch (e) {
    return "";
  }
}

async function handleSuiteletScreenshot() {
  const tabId = requireSuiteletControlTab();
  await ensureSuiteletDebugger(tabId);
  const data = await captureSuiteletScreenshotData(tabId);
  const tab = await dashboardTabsGet(tabId).catch(() => null);
  const content = [{
    type: "text",
    text: JSON.stringify({ ok: true, url: tab?.url || "", title: tab?.title || "" }, null, 2)
  }];
  if (data) content.push({ type: "image", data, mimeType: "image/jpeg" });
  return { content };
}

async function handleSuiteletHover(args) {
  const tabId = requireSuiteletControlTab();
  await focusSuiteletControlTab();
  const selector = String(args?.selector || "").trim();
  let x = Number(args?.x);
  let y = Number(args?.y);
  let resolved = null;

  if (selector) {
    resolved = await evalInSuiteletTab(`(function () {
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false };
      el.scrollIntoView({ block: "center", inline: "center" });
      var r = el.getBoundingClientRect();
      return { ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2, label: (el.innerText || el.value || el.getAttribute("title") || "").trim().slice(0, 100) };
    })()`);
    if (!resolved || !resolved.ok) throw new Error(`Element not found: ${selector}`);
    x = resolved.x;
    y = resolved.y;
  }

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Provide a selector, or x and y viewport coordinates, to hover.");
  }

  // Native :hover requires a real pointer move through CDP.
  try {
    await sendSuiteletDebuggerCommand(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
  } catch (e) { /* fall back to synthetic events below */ }

  // Synthetic pointer/mouse events for JS-driven tooltips/menus.
  await evalInSuiteletTab(`(function () {
    var el = document.elementFromPoint(${x}, ${y});
    if (!el) return { ok: false };
    ["pointerover", "pointerenter", "mouseover", "mouseenter", "mousemove"].forEach(function (type) {
      try {
        el.dispatchEvent(new MouseEvent(type, { bubbles: type.indexOf("enter") === -1, cancelable: true, clientX: ${x}, clientY: ${y} }));
      } catch (e) {}
    });
    return { ok: true };
  })()`).catch(() => null);

  const data = await captureSuiteletScreenshotData(tabId);
  const content = [{
    type: "text",
    text: JSON.stringify({ ok: true, target: selector || `${x},${y}`, x, y, label: resolved?.label || "" }, null, 2)
  }];
  if (data) content.push({ type: "image", data, mimeType: "image/jpeg" });
  return { content };
}

async function handleSuiteletScroll(args) {
  const tabId = requireSuiteletControlTab();
  await focusSuiteletControlTab();
  const selector = String(args?.selector || "").trim();
  const to = String(args?.to || "").trim().toLowerCase(); // "top" | "bottom" | ""
  const dy = Number(args?.dy);
  const dx = Number(args?.dx);
  const expression = `(function () {
    var selector = ${JSON.stringify(selector)};
    var to = ${JSON.stringify(to)};
    var dy = ${Number.isFinite(dy) ? dy : "null"};
    var dx = ${Number.isFinite(dx) ? dx : "null"};

    // Find the most relevant scrollable element on the page (e.g. a DataTables
    // results body with overflow:auto and a fixed height), preferring the tallest.
    function findScrollable() {
      var best = null, bestScore = -1;
      var all = document.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        var node = all[i];
        var overflowable = node.scrollHeight - node.clientHeight > 40;
        if (!overflowable) continue;
        var oy = getComputedStyle(node).overflowY;
        if (oy !== "auto" && oy !== "scroll") continue;
        var score = (node.scrollHeight - node.clientHeight) * Math.max(1, node.clientHeight);
        if (score > bestScore) { bestScore = score; best = node; }
      }
      return best;
    }

    var el = selector ? document.querySelector(selector) : null;
    if (selector && !el) return { ok: false, error: "Element not found: " + selector };

    // Pure "scroll into view" when a selector is given with no movement args.
    if (el && dy == null && dx == null && !to) {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      var r0 = el.getBoundingClientRect();
      return { ok: true, target: selector, scrolledIntoView: true };
    }

    // Choose what to scroll: explicit selector, else the detected inner container,
    // else the document. Scroll both the chosen element AND the window so we move
    // regardless of which one actually overflows.
    var inner = el || findScrollable();
    var docEl = document.scrollingElement || document.documentElement;
    var pageEl = (inner === docEl || inner === document.body || inner == null) ? null : inner;

    function curTop(node) { return node === docEl ? (window.scrollY || docEl.scrollTop || 0) : node.scrollTop; }
    var beforePage = pageEl ? curTop(pageEl) : null;
    var beforeWin = window.scrollY || docEl.scrollTop || 0;

    function applyTo(node, isWindow) {
      if (to === "bottom") { if (isWindow) window.scrollTo(0, docEl.scrollHeight); else node.scrollTop = node.scrollHeight; }
      else if (to === "top") { if (isWindow) window.scrollTo(0, 0); else node.scrollTop = 0; }
      else { var ddy = (dy == null ? 600 : dy); if (isWindow) window.scrollBy(dx || 0, ddy); else { node.scrollTop += ddy; node.scrollLeft += (dx || 0); } }
    }
    if (pageEl) applyTo(pageEl, false);
    applyTo(docEl, true);

    var afterPage = pageEl ? curTop(pageEl) : null;
    var afterWin = window.scrollY || docEl.scrollTop || 0;
    var movedContainer = pageEl ? (afterPage - beforePage) : 0;
    var movedWindow = afterWin - beforeWin;
    var ref = pageEl || docEl;
    var refTop = pageEl ? afterPage : afterWin;
    return {
      ok: true,
      target: selector || (pageEl ? "auto-detected scroll container" : "window"),
      movedContainerPx: movedContainer,
      movedWindowPx: movedWindow,
      moved: Math.abs(movedContainer) + Math.abs(movedWindow) > 0,
      scrollTop: refTop,
      scrollHeight: ref.scrollHeight,
      clientHeight: ref.clientHeight || window.innerHeight,
      atBottom: refTop + (ref.clientHeight || window.innerHeight) >= (ref.scrollHeight || 0) - 2
    };
  })()`;
  const value = await evalInSuiteletTab(expression);
  const data = await captureSuiteletScreenshotData(tabId);
  const content = [{ type: "text", text: JSON.stringify(value, null, 2) }];
  if (data) content.push({ type: "image", data, mimeType: "image/jpeg" });
  return { content };
}

async function handleSuiteletFill(args) {
  const selector = String(args?.selector || "").trim();
  if (!selector) throw new Error("selector is required.");
  const value = args?.value == null ? "" : String(args.value);
  await focusSuiteletControlTab();
  const expression = `(function () {
    var el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, error: "Element not found: " + ${JSON.stringify(selector)} };
    var value = ${JSON.stringify(value)};

    function findNetsuiteDropdownParts(node) {
      var input = null;
      if (node && node.matches && node.matches("input.dropdownInput, input.nldropdown")) input = node;
      if (!input && node && node.getAttribute && node.getAttribute("data-input-id")) {
        input = document.getElementById(node.getAttribute("data-input-id"));
      }
      if (!input && node && node.closest) {
        var wrapper = node.closest(".uir-field-wrapper[data-nsps-label], .uir-select-input-container, .uir-field-input.nldropdown, span[data-fieldtype='select']");
        if (wrapper) input = wrapper.querySelector("input.dropdownInput, input.nldropdown");
      }
      if (!input) return null;

      var fieldName = "";
      if (input.name && input.name.indexOf("inpt_") === 0) fieldName = input.name.slice(5);
      if (!fieldName) {
        var fieldWrapper = input.closest && input.closest(".uir-field-wrapper[data-field-name]");
        fieldName = fieldWrapper ? fieldWrapper.getAttribute("data-field-name") : "";
      }
      if (!fieldName) return null;

      var dropdown = document.querySelector(".ns-dropdown[data-name='" + CSS.escape(fieldName) + "']");
      var hidden = document.querySelector("input[type='hidden'][name='" + CSS.escape(fieldName) + "']");
      var index = hidden && hidden.id ? document.getElementById(hidden.id.replace(/^hddn_/, "indx_")) : null;
      return { input: input, fieldName: fieldName, dropdown: dropdown, hidden: hidden, index: index };
    }

    function setNativeValue(node, nextValue) {
      try {
        var proto = node.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        var descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        if (descriptor && descriptor.set) descriptor.set.call(node, nextValue);
        else node.value = nextValue;
      } catch (e) { node.value = nextValue; }
    }

    var dropdownParts = findNetsuiteDropdownParts(el);
    if (dropdownParts && dropdownParts.dropdown && dropdownParts.hidden) {
      var options = [];
      try { options = JSON.parse(dropdownParts.dropdown.getAttribute("data-options") || "[]"); } catch (e) {}
      var needle = value.trim().toLowerCase();
      var option = options.filter(function (opt) {
        return String(opt.value) === value || String(opt.text).trim().toLowerCase() === needle;
      })[0] || options.filter(function (opt) {
        return String(opt.text).trim().toLowerCase().indexOf(needle) !== -1;
      })[0];
      if (!option) {
        return {
          ok: false,
          error: "No NetSuite dropdown option matched: " + value,
          selector: ${JSON.stringify(selector)},
          fieldName: dropdownParts.fieldName,
          options: options.slice(0, 20)
        };
      }

      setNativeValue(dropdownParts.input, String(option.text || " "));
      setNativeValue(dropdownParts.hidden, String(option.value || ""));
      if (dropdownParts.index) {
        var idx = options.indexOf(option);
        setNativeValue(dropdownParts.index, idx >= 0 ? String(idx) : "");
      }
      dropdownParts.input.dispatchEvent(new Event("input", { bubbles: true }));
      dropdownParts.input.dispatchEvent(new Event("change", { bubbles: true }));
      dropdownParts.hidden.dispatchEvent(new Event("input", { bubbles: true }));
      dropdownParts.hidden.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        ok: true,
        selector: ${JSON.stringify(selector)},
        fieldName: dropdownParts.fieldName,
        value: String(option.value || ""),
        text: String(option.text || ""),
        mode: "netsuite-dropdown"
      };
    }

    el.focus();
    try {
      setNativeValue(el, value);
    } catch (e) { el.value = value; }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, selector: ${JSON.stringify(selector)}, value: el.value };
  })()`;
  const value2 = await evalInSuiteletTab(expression);
  return { content: [{ type: "text", text: JSON.stringify(value2, null, 2) }] };
}

async function handleSuiteletClick(args) {
  const selector = String(args?.selector || "").trim();
  const text = String(args?.text || "").trim();
  if (!selector && !text) throw new Error("Provide a selector or visible text to click.");
  await focusSuiteletControlTab();
  const tabId = requireSuiteletControlTab();
  await ensureSuiteletDebugger(tabId);
  const expression = `(function () {
    function isVisible(node) {
      if (!node) return false;
      var r = node.getBoundingClientRect();
      var s = window.getComputedStyle(node);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    }

    function bestNetsuiteDropdownClickTarget(node) {
      var input = null;
      if (node && node.matches && node.matches("input.dropdownInput, input.nldropdown")) input = node;
      if (!input && node && node.closest) {
        var wrapper = node.closest(".uir-field-wrapper[data-nsps-label], .uir-select-input-container, .uir-field-input.nldropdown, span[data-fieldtype='select']");
        if (wrapper) input = wrapper.querySelector("input.dropdownInput, input.nldropdown");
      }
      if (!input) return node;

      var arrow = null;
      if (input.id) {
        arrow = document.querySelector(".ddarrowSpan[data-input-id='" + CSS.escape(input.id) + "'], .uir-field-dropdown-arrow[data-input-id='" + CSS.escape(input.id) + "']");
      }
      if (!arrow) {
        var container = input.closest(".uir-select-input-container, .uir-field-input.nldropdown, span[data-fieldtype='select']");
        arrow = container && container.querySelector(".ddarrowSpan, .uir-field-dropdown-arrow");
      }
      return arrow || input;
    }

    function findNetsuiteDropdownInput(node) {
      if (!node) return null;
      if (node.matches && node.matches("input.dropdownInput, input.nldropdown")) return node;
      if (node.getAttribute && node.getAttribute("data-input-id")) {
        var byId = document.getElementById(node.getAttribute("data-input-id"));
        if (byId) return byId;
      }
      if (node.closest) {
        var wrapper = node.closest(".uir-field-wrapper[data-nsps-label], .uir-select-input-container, .uir-field-input.nldropdown, span[data-fieldtype='select']");
        if (wrapper) return wrapper.querySelector("input.dropdownInput, input.nldropdown");
      }
      return null;
    }

    function dropdownVisibleForInput(input) {
      if (!input) return false;
      var name = input.name || "";
      if (name.indexOf("inpt_") === 0) name = name.slice(5);
      var wrappers = Array.prototype.slice.call(document.querySelectorAll(".ns-dropdown"));
      return wrappers.some(function (node) {
        if (name && node.getAttribute("data-name") !== name) return false;
        var r = node.getBoundingClientRect();
        var s = getComputedStyle(node);
        return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
      });
    }

    function makeDropdownEvent(type, input) {
      return {
        type: type,
        target: input,
        currentTarget: input,
        srcElement: input,
        key: "ArrowDown",
        code: "ArrowDown",
        keyCode: 40,
        which: 40,
        altKey: true,
        bubbles: true,
        cancelable: true,
        preventDefault: function () {},
        stopPropagation: function () {},
        stopImmediatePropagation: function () {}
      };
    }

    function openNetsuiteDropdown(input) {
      var attempts = [];
      if (!input) return { attempted: false, open: false, attempts: attempts };
      try { input.focus(); attempts.push("input.focus"); } catch (e) { attempts.push("input.focus:" + e.message); }

      var controller = null;
      try {
        if (typeof window.getDropdown === "function") {
          controller = window.getDropdown(input);
          attempts.push("getDropdown");
        }
      } catch (e) { attempts.push("getDropdown:" + e.message); }

      if (controller) {
        [
          ["handleOnFocus", makeDropdownEvent("focus", input)],
          ["handleKeydown", makeDropdownEvent("keydown", input)],
          ["handleKeypress", makeDropdownEvent("keypress", input)]
        ].forEach(function (entry) {
          try {
            if (typeof controller[entry[0]] === "function") {
              controller[entry[0]](entry[1]);
              attempts.push(entry[0]);
            }
          } catch (e) { attempts.push(entry[0] + ":" + e.message); }
        });

        var methodNames = [];
        try {
          methodNames = Object.keys(controller);
          var proto = Object.getPrototypeOf(controller);
          if (proto) methodNames = methodNames.concat(Object.getOwnPropertyNames(proto));
        } catch (e) {}
        methodNames = methodNames.filter(function (name, idx, arr) {
          return arr.indexOf(name) === idx && /^(open|show|expand|toggle|display)|dropdown|popup/i.test(name) && typeof controller[name] === "function";
        });
        methodNames.slice(0, 12).forEach(function (name) {
          if (dropdownVisibleForInput(input)) return;
          try {
            controller[name]();
            attempts.push(name);
          } catch (e) { attempts.push(name + ":" + e.message); }
        });
      }

      if (!dropdownVisibleForInput(input)) {
        ["keydown", "keyup"].forEach(function (type) {
          try {
            input.dispatchEvent(new KeyboardEvent(type, {
              bubbles: true,
              cancelable: true,
              key: "ArrowDown",
              code: "ArrowDown",
              keyCode: 40,
              which: 40,
              altKey: true
            }));
            attempts.push(type + ":AltArrowDown");
          } catch (e) { attempts.push(type + ":" + e.message); }
        });
      }

      return { attempted: true, open: dropdownVisibleForInput(input), attempts: attempts };
    }

    function dispatchJsClick(node, x, y) {
      ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(function (type) {
        try {
          var EventCtor = type.indexOf("pointer") === 0 && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
          node.dispatchEvent(new EventCtor(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: x,
            clientY: y,
            button: 0,
            buttons: type === "pointerdown" || type === "mousedown" ? 1 : 0,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true
          }));
        } catch (e) {
          try {
            node.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
          } catch (ignored) {}
        }
      });
    }

    function fireNetsuiteArrowClick(input, arrow) {
      if (!input || !arrow) return false;
      try { input.focus(); } catch (e) {}
      ["mouseover", "mousedown", "mouseup", "click"].forEach(function (type) {
        try {
          arrow.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0
          }));
        } catch (e) {}
      });
      return true;
    }

    var el = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : "null"};
    if (!el && ${JSON.stringify(text)}) {
      var needle = ${JSON.stringify(text.toLowerCase())};
      var cands = Array.prototype.slice.call(
        document.querySelectorAll("button, a, input[type=button], input[type=submit], [role=button], .uir-button, span.bntxt, td.bntxt, .ddarrowSpan, .uir-field-dropdown-arrow, input.dropdownInput, .uir-label-span, .uir-field-wrapper[data-nsps-label]")
      );
      el = cands.filter(function (c) {
        var labelledBy = c.getAttribute("aria-labelledby") ? document.getElementById(c.getAttribute("aria-labelledby")) : null;
        var wrapper = c.closest ? c.closest(".uir-field-wrapper[data-nsps-label]") : null;
        var label = (c.innerText || c.value || c.getAttribute("title") || c.getAttribute("data-nsps-label") || (labelledBy && labelledBy.innerText) || (wrapper && wrapper.getAttribute("data-nsps-label")) || "").trim().toLowerCase();
        return label === needle;
      })[0] || cands.filter(function (c) {
        var labelledBy = c.getAttribute("aria-labelledby") ? document.getElementById(c.getAttribute("aria-labelledby")) : null;
        var wrapper = c.closest ? c.closest(".uir-field-wrapper[data-nsps-label]") : null;
        var label = (c.innerText || c.value || c.getAttribute("title") || c.getAttribute("data-nsps-label") || (labelledBy && labelledBy.innerText) || (wrapper && wrapper.getAttribute("data-nsps-label")) || "").trim().toLowerCase();
        return label.indexOf(needle) !== -1;
      })[0];
    }
    if (!el) return { ok: false, error: "Clickable element not found." };
    var dropdownInput = findNetsuiteDropdownInput(el);
    el = bestNetsuiteDropdownClickTarget(el);
    if (el.scrollIntoView) el.scrollIntoView({ block: "center", inline: "center" });
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2;
    var y = r.top + r.height / 2;
    if (!isVisible(el)) return { ok: false, error: "Clickable element is not visible." };
    try { el.focus && el.focus(); } catch (e) {}
    var usedNetsuiteArrowSequence = dropdownInput ? fireNetsuiteArrowClick(dropdownInput, el) : false;
    dispatchJsClick(el, x, y);
    var dropdownOpen = openNetsuiteDropdown(dropdownInput);
    return {
      ok: true,
      clicked: (el.innerText || el.value || el.id || el.getAttribute("title") || el.tagName || "").toString().trim().slice(0, 100),
      x: x,
      y: y,
      tag: el.tagName,
      id: el.id || "",
      className: String(el.className || ""),
      usedNetsuiteArrowSequence: usedNetsuiteArrowSequence,
      netsuiteDropdown: dropdownOpen
    };
  })()`;
  const value = await evalInSuiteletTab(expression);
  if (value?.ok && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))) {
    try {
      await sendSuiteletDebuggerCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: Number(value.x),
        y: Number(value.y),
        buttons: 0
      });
      await sendSuiteletDebuggerCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: Number(value.x),
        y: Number(value.y),
        button: "left",
        buttons: 1,
        clickCount: 1
      });
      await sendSuiteletDebuggerCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: Number(value.x),
        y: Number(value.y),
        button: "left",
        buttons: 0,
        clickCount: 1
      });
      if (value.netsuiteDropdown?.attempted && !value.netsuiteDropdown?.open) {
        await sendSuiteletDebuggerCommand(tabId, "Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "ArrowDown",
          code: "ArrowDown",
          windowsVirtualKeyCode: 40,
          nativeVirtualKeyCode: 40,
          modifiers: 1
        });
        await sendSuiteletDebuggerCommand(tabId, "Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "ArrowDown",
          code: "ArrowDown",
          windowsVirtualKeyCode: 40,
          nativeVirtualKeyCode: 40,
          modifiers: 1
        });
      }
    } catch (e) {
      value.nativeClickError = String(e?.message || e);
    }
  }
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

async function handleSuiteletRead(args) {
  const selector = String(args?.selector || "").trim();
  const maxLength = Math.max(100, Math.min(40000, Number(args?.maxLength) || 8000));
  const expression = `(function () {
    var target = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : "document.body"};
    if (!target) return { ok: false, error: "Element not found." };
    var text = (target.value != null && target.value !== "") ? target.value : (target.innerText || target.textContent || "");
    return { ok: true, selector: ${JSON.stringify(selector || "body")}, length: text.length, text: text.slice(0, ${maxLength}) };
  })()`;
  const value = await evalInSuiteletTab(expression);
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

async function handleSuiteletEval(args) {
  const expression = String(args?.expression || "").trim();
  if (!expression) throw new Error("expression is required.");
  const value = await evalInSuiteletTab(`(function () { return (${expression}); })()`).catch(async (err) => {
    // Allow statement-style snippets too (not just expressions).
    if (/SyntaxError|Unexpected/i.test(String(err?.message || err))) {
      return evalInSuiteletTab(`(function () { ${expression} })()`);
    }
    throw err;
  });
  return { content: [{ type: "text", text: JSON.stringify({ ok: true, value }, null, 2) }] };
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
  const allTabs = await dashboardTabsQuery({});
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
