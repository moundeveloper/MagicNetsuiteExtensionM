console.log("netsuiteApi");

const loadNetsuiteApi = async () => {
  return new Promise((resolve, reject) => {
    if (typeof require === "undefined") return resolve(null);

    require(["N"], (NModule) => {
      N = NModule;
      resolve(N);
    });
  });
};

// Central listener for messages from the extension
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== "FROM_EXTENSION") return;

  const { requestId, action, data, mode } = event.data.payload;

  const payload = {
    requestId,
    mode,
    ...data
  };

  const handler = handlers[action];
  if (!handler) {
    return sendToExtension({
      requestId,
      status: "error",
      message: `No handler for ${action}`
    });
  }

  try {
    const modules = await loadNetsuiteApi();
    console.log("Modules:", modules);

    if (!modules) {
      console.log("Could not load netsuiteApi");
      sendToExtension({ requestId, status: "API_NOT_AVAILABLE" });
      return;
    }

    const csrfToken = document.querySelector('input[name="_csrf"]')?.value;

    const result =
      (await handler({ modules, payload, csrfToken: csrfToken })) || null;

    sendToExtension({ requestId, status: "ok", message: result });
  } catch (err) {
    console.log("Error:", err);
    // Safely extract a string message from any thrown value.
    // NetSuite SuiteScript errors can have .message as an object or be
    // thrown as a plain object — both produce "[object Object]" if coerced
    // directly via new Error() or string concatenation.
    let errMsg;
    if (typeof err === "string") {
      errMsg = err;
    } else if (err && typeof err.message !== "undefined") {
      errMsg =
        typeof err.message === "string"
          ? err.message
          : JSON.stringify(err.message);
    } else if (err) {
      errMsg = JSON.stringify(err);
    } else {
      errMsg = "Unknown error";
    }
    sendToExtension({ requestId, status: "error", message: errMsg });
  }
});

const sendToExtension = (msg) => {
  window.postMessage({ type: "TO_EXTENSION", payload: msg }, "*");
};

// Map of handlers keyed by action names
const handlers = {
  SCRIPTS: async ({ modules, payload: { scriptid } }) => {
    console.log("Scripts action received:", scriptid);
    return window.getScripts(modules, { scriptId: scriptid });
  },
  CUSTOM_RECORDS: async ({ modules }) => {
    console.log("Custom Records action received");
    return window.getCustomRecords(modules);
  },
  ADVANCED_PDF_TEMPLATES: async ({ modules }) => {
    console.log("Advanced PDF Templates action received");
    return window.getAdvancedPDFTemplates(modules);
  },
  GET_TEMPLATES_CONTENT: async ({ modules, payload }) => {
    console.log("Get Templates Content action received:", payload.templateId);
    return window.getAdvancedPDFTemplatesContent(modules, payload);
  },
  SAVE_TEMPLATE: async ({ modules, payload }) => {
    console.log("Save Templates Content action received:", payload.templateId);
    console.log("payload", payload);
    return window.savePdfTemplate(modules, payload);
  },
  PREVIEW: async ({ modules, payload }) => {
    console.log("Preview action received:", payload.templateId);
    return window.previewPdfTemplate(modules, payload);
  },
  SCRIPT_URL: async ({ modules, payload: { scriptId } }) => {
    console.log("Script URL action received:", scriptId);
    return window.getScriptUrl(modules, { scriptId });
  },
  CUSTOM_RECORD_URL: async ({ modules, payload: { recordId } }) => {
    console.log("Custom Record URL action received:", recordId);
    return window.getCustomRecordUrl(modules, { recordId });
  },
  CUSTOM_RECORD_LIST_URL: async ({ modules, payload: { recordId } }) => {
    console.log("Custom Record URL action received:", recordId);
    return window.getCustomRecordListUrl(modules, { recordId });
  },
  RUN_QUICK_SCRIPT: async ({ modules, payload: { code, requestId, mode } }) => {
    console.log("Run Quick Script action received", { mode });
    try {
      // Pass mode to runQuickScript
      await window.runQuickScript(modules, { code, requestId, mode });

      // For streaming, don't return anything here - data flows through postMessage
      if (mode === "stream") {
        return null;
      }

      // For normal mode, return initial log
      return { type: "log", values: ["Script execution started"] };
    } catch (err) {
      return [
        { type: "error", values: ["Script execution error: " + err.message] }
      ];
    }
  },
  RUN_QUICK_SCRIPT_SERVER: async ({
    modules,
    payload: { code, userId },
    csrfToken
  }) => {
    console.log("Run Quick Script Server action received", { userId });

    return window.runQuickScriptServer(modules, { code, userId }, csrfToken);

    try {
      const N = modules;
      const { query, url } = N;

      // Step 1: Get or create Magic folder
      const { folderId } = await window.getOrCreateMagicFolder(N);
      console.log("[RUN_QUICK_SCRIPT_SERVER] Folder ID:", folderId);

      if (!folderId) {
        throw new Error("Failed to get or create Magic folder");
      }

      // Step 2: Get or create handler module
      const handlerInfo = await window.getOrCreateHandlerModule(N, folderId);
      console.log("[RUN_QUICK_SCRIPT_SERVER] Handler module:", handlerInfo);

      // Step 3: Get or create suitelet
      const suiteletInfo = await window.getOrCreateSuitelet(
        N,
        folderId,
        handlerInfo.scriptRecordId
      );
      console.log("[RUN_QUICK_SCRIPT_SERVER] Suitelet:", suiteletInfo);

      // Step 4: Update user handler
      await window.updateUserHandler(N, folderId, userId, code);
      console.log("[RUN_QUICK_SCRIPT_SERVER] User handler updated");

      // Step 5: Execute server script
      const result = await window.executeServerScript(
        N,
        SUITELET_SCRIPT_ID,
        suiteletInfo.deploymentId,
        userId
      );

      console.log("[RUN_QUICK_SCRIPT_SERVER] Execution result:", result);
      return result;
    } catch (err) {
      console.error("[RUN_QUICK_SCRIPT_SERVER] Error:", err);
      return { error: err.message };
    }
  },
  CHECK_SERVER_COMPONENTS: async ({ modules, payload, csrfToken }) => {
    return window.checkMagicNetsuiteComponents(modules, {}, csrfToken);
  },
  REMOVE_SERVER_COMPONENTS: async ({ modules, payload, csrfToken }) => {
    console.log("Remove Server Components action received");
    return await window.removeMagicNetsuiteComponents(modules, {}, csrfToken);
  },
  SCRIPTS_DEPLOYED: async ({ modules, payload: { recordType } }) => {
    console.log("Scripts Deployed action received");
    return window.getDeployedScriptFiles(modules, { recordType });
  },
  SCRIPT_FILES: async ({ modules, payload: { scriptIds } }) => {
    console.log("Script Files action received", { scriptIds });
    return window.getScriptFiles(modules, { scriptIds });
  },
  CURRENT_REC_TYPE: async ({ modules }) => {
    console.log("Current Record Type action received");
    return window.getCurrentRecordIdType(modules);
  },
  CURRENT_USER: async ({ modules }) => {
    console.log("Current User action received");
    return window.getCurrentUser(modules);
  },
  EXPORT_RECORD: async ({ modules, payload: { config } }) => {
    console.log("Export Record action received");
    return window.exportRecord(modules, config);
  },
  CHECK_CONNECTION: async ({ modules }) => {
    if (modules) return "connected";
    return "disconnected";
  },
  AVAILABLE_MODULES: async ({ modules }) => {
    console.log("Available Modules action received");
    return Object.keys(modules);
  },
  SCRIPT_TYPES: async ({ modules }) => {
    console.log("Script Types action received");
    return window.getScriptTypes(modules);
  },
  SCRIPT_DEPLOYMENTS: async ({ modules, payload: { scriptId, scriptIds } }) => {
    console.log("Script Deployments action received", { scriptId, scriptIds });
    return window.getDeployments(modules, { scriptId, scriptIds });
  },
  SCRIPT_DEPLOYMENT_URL: async ({ modules, payload: { deployment } }) => {
    console.log("Script Deployment URL action received");
    return window.getScriptDeploymentUrl(modules, { deployment });
  },
  SUITELET_URL: async ({ modules, payload: { script, deployment } }) => {
    console.log("Open Suitelet action received");
    return window.getSuiteletUrl(modules, { script, deployment });
  },
  OPEN_DEPLOYMENT_SUITELET: async ({
    modules,
    payload: { script, deployment }
  }) => {
    console.log("Open Deployment Suitelet action received", {
      script,
      deployment
    });
    return window.getSuiteletUrl(modules, { script, deployment });
  },
  LOGS: async ({
    modules,
    payload: { startDate, endDate, scriptIds, deploymentIds, scriptTypes }
  }) => {
    console.log("Logs action received", { startDate, endDate });

    startDate = startDate ? new Date(startDate) : null;
    endDate = endDate ? new Date(endDate) : null;

    return window.getLogsByTime(modules, {
      startDate,
      endDate,
      scriptIds,
      deploymentIds,
      scriptTypes
    });
  },
  ROOT_FOLDERS: async ({ modules }) => {
    console.log("Root Folders action received");
    return window.getRootFolders(modules);
  },
  CREATE_FOLDER: async ({
    modules,
    payload: { name, parentFolder },
    csrfToken
  }) => {
    console.log("Create Folder action received");

    return await window.createFolder(modules, {
      folderName: name,
      parentFolderId: parentFolder,
      csrfToken
    });
  },
  UPLOAD_FILE: async ({
    modules,
    payload: { fileName, fileContent, folderId },
    csrfToken
  }) => {
    console.log("Upload File action received", { fileName, folderId });

    return await window.uploadFile(modules, {
      fileName,
      fileContent,
      folderId: folderId ?? -15,
      csrfToken
    });
  },
  CREATE_SCRIPT: async ({
    modules,
    payload: { name, scriptId, fileId, scriptType, description, apiVersion },
    csrfToken
  }) => {
    console.log("Create Script action received", {
      name,
      scriptId,
      fileId,
      scriptType
    });
    return await window.createScriptRecord(
      modules,
      { name, scriptId, fileId, scriptType, description, apiVersion },
      csrfToken
    );
  },
  GET_ALL_RECORD_TYPES: async ({ modules }) => {
    console.log("Get All Record Types action received");
    const { record, query } = modules;
    return window.getAllRecordTypes({ record, query });
  },
  PING: async ({ modules, payload: { delay } }) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ pong: true, delay });
      }, delay);
    });
  },
  FETCH_SUITEQL_TABLES: async () => {
    console.log("Fetch SuiteQL Tables action received");
    return window.fetchSuiteQLTables();
  },
  FETCH_SUITEQL_TABLE_DETAIL: async ({ payload: { tableName } }) => {
    console.log("Fetch SuiteQL Table Detail action received:", tableName);
    return window.fetchSuiteQLTableDetail(tableName);
  },
  RUN_SUITEQL_QUERY: async ({ modules, payload: { sql, limit } }) => {
    console.log("Run SuiteQL Query action received", { limit });
    return window.runSuiteQLQuery(modules, sql, limit ?? 1000);
  },
  GET_SUITEQL_COUNT: async ({ modules, payload: { sql } }) => {
    console.log("Get SuiteQL Count action received");
    return window.getSuiteQLCount(modules, sql);
  },
  FETCH_ACCOUNTS: async () => {
    console.log("Fetch Accounts action received");
    try {
      // Extract account ID from current domain (e.g., "1964539" from "1964539.app.netsuite.com")
      const getCurrentAccountIdFromDomain = () => {
        const hostname = window.location.hostname;
        const parts = hostname.split(".");
        // Expected format: [accountId].app.netsuite.com
        if (
          parts.length >= 4 &&
          parts[1] === "app" &&
          parts[2] === "netsuite" &&
          parts[3] === "com"
        ) {
          return parts[0];
        }
        return parts[0]; // Fallback to first segment
      };
      const accountId = getCurrentAccountIdFromDomain();
      const url = `https://${accountId}.app.netsuite.com/app/login/secure/myroles/myroles.nl?whence=`;
      const response = await fetch(url, {
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "it-IT,it;q=0.6",
          "cache-control": "max-age=0",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "same-origin",
          "upgrade-insecure-requests": "1"
        },
        credentials: "include"
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const scripts = doc.querySelectorAll("script");
      for (const script of scripts) {
        const content = script.textContent;
        if (!content.includes("allAccounts")) continue;
        try {
          const data = JSON.parse(content);
          const findContainer = (obj) => {
            if (!obj || typeof obj !== "object") return null;
            for (const key of Object.keys(obj)) {
              if (key.trim() === "allAccounts" && Array.isArray(obj[key]))
                return obj;
            }
            for (const key of Object.keys(obj)) {
              const result = findContainer(obj[key]);
              if (result) return result;
            }
            return null;
          };
          const container = findContainer(data);
          if (!container) continue;
          const getVal = (obj, key) =>
            obj[key] || obj[` ${key}`] || obj[`  ${key}`];

          const currentAccount = container["account"] || container[" account"];
          const allAccounts = getVal(container, "allAccounts") || [];
          const allRoles = getVal(container, "allRoles") || [];
          const accounts = [];
          // Add current account first
          if (currentAccount) {
            accounts.push({
              id: (getVal(currentAccount, "accountId") || "").trim(),
              name: (getVal(currentAccount, "accountName") || "").trim(),
              type: (getVal(currentAccount, "accountType") || "").trim(),
              isCurrent: true
            });
          }
          // Add all other accounts
          allAccounts.forEach((acc) => {
            accounts.push({
              id: (getVal(acc, "accountId") || "").trim(),
              name: (getVal(acc, "accountName") || "").trim(),
              type: (getVal(acc, "accountType") || "").trim(),
              isCurrent: false
            });
          });
          return {
            accounts,
            roles: allRoles.map((r) => ({
              id: r?.entityRoleId?.rol || r?.["entityRoleId"]?.["rol"],
              name: (getVal(r, "roleName") || "").trim()
            }))
          };
        } catch (e) {
          // JSON parse failed for this script tag, continue
        }
      }
      return { accounts: [], roles: [] };
    } catch (error) {
      console.error("Fetch accounts failed:", error);
      return { accounts: [], roles: [], error: error.message };
    }
  }
};
