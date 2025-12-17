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
window.addEventListener("fromExtension", async ({ detail: request }) => {
  const { action, data: payload } = request;

  const handler = handlers[action];
  if (handler === handlers.CHECK_CONNECTION) {
    const modules = await loadNetsuiteApi();
    const result = (await handler({ modules, payload })) || null;
    sendToExtension({ status: "ok", message: result });

    return;
  }

  if (handler) {
    try {
      const N = await loadNetsuiteApi();
      if (N) {
        console.log(
          "%cNetSuite Utils:",
          "color:green;font-weight:bold",
          "N Module Loaded:",
          N
        );
      } else {
        console.log("Unable to load Script Module.");
      }

      const result = (await handler({ modules: N, payload })) || null;
      sendToExtension({ status: "ok", message: result });
    } catch (err) {
      console.error("Handler error:", err);
      sendToExtension({ status: "error", message: err.message });
    }
  } else {
    console.warn("No handler found for action:", action);
    sendToExtension({ status: "error", message: `No handler for ${action}` });
  }
});

// Utility to send messages back to the extension
function sendToExtension(msg) {
  window.dispatchEvent(new CustomEvent("toExtension", { detail: msg }));
}

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
  SCRIPT_URL: async ({ modules, payload: { scriptId } }) => {
    console.log("Script URL action received:", scriptId);
    return window.getScriptUrl(modules, { scriptId });
  },
  CUSTOM_RECORD_URL: async ({ modules, payload: { recordId } }) => {
    console.log("Custom Record URL action received:", recordId);
    return window.getCustomRecordUrl(modules, { recordId });
  },
  RUN_QUICK_SCRIPT: async ({ modules, payload: { code } }) => {
    console.log("Run Quick Script action received");
    return window.runQuickScript(modules, { code });
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
};
