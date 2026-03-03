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

    const result = (await handler({ modules, payload })) || null;

    sendToExtension({ requestId, status: "ok", message: result });
  } catch (err) {
    console.log("Error:", err);
    sendToExtension({ requestId, status: "error", message: err.message });
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
  SCRIPT_URL: async ({ modules, payload: { scriptId } }) => {
    console.log("Script URL action received:", scriptId);
    return window.getScriptUrl(modules, { scriptId });
  },
  CUSTOM_RECORD_URL: async ({ modules, payload: { recordId } }) => {
    console.log("Custom Record URL action received:", recordId);
    return window.getCustomRecordUrl(modules, { recordId });
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
  SCRIPTS_DEPLOYED: async ({ modules, payload: { recordType } }) => {
    console.log("Scripts Deployed action received");
    return window.getDeployedScriptFiles(modules, { recordType });
  },
  CURRENT_REC_TYPE: async ({ modules }) => {
    console.log("Current Record Type action received");
    return window.getCurrentRecordIdType(modules);
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
  CREATE_FOLDER: async ({ modules, payload: { name, parentFolder } }) => {
    console.log("Create Folder action received");
    const csrfToken = document.querySelector('input[name="_csrf"]')?.value;
    return await window.createFolder(modules, {
      folderName: name,
      parentFolderId: parentFolder,
      csrfToken
    });
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
  }
};
