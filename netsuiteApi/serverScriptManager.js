/**
 * Server Script Manager - Manages folder, files, script records, and deployments
 * for server-side Quick Script execution
 */

const CONFIG = {
  FOLDER_NAME: "MagicNetsuiteScripts",
  SERVER_FILE: "magic_netsuite_server.js",
  scriptId: "customscript_magic_netsuite_server",
  SUITELET_SCRIPT_NAME: "Magic Netsuite Server",
  SUITELET_SCRIPT_ID: "_magic_netsuite_server",
  SUITELET_DEPLOYMENT_NAME: "Magic Netsuite Server Deployment",
  SUITELET_SCRIPT_DEPLOY_ID: "_magic_netsuite_server_dp"
};

window.checkMagicNetsuiteComponents = async ({ query }) => {
  try {
    console.log("Checking server components...");

    // 1. Check folder
    const [folder] = (
      await query.runSuiteQL.promise({
        query: `SELECT id FROM MediaItemFolder WHERE name = ? AND parent = -15`,
        params: [CONFIG.FOLDER_NAME]
      })
    ).asMappedResults();

    if (!folder) {
      return {
        folderExists: false,
        serverFileExists: false,
        suiteletScriptExists: false,
        suiteletDeployed: false,
        allReady: false
      };
    }

    const folderId = folder.id;

    // 2. Check server file
    const files = (
      await query.runSuiteQL.promise({
        query: `SELECT name FROM file WHERE folder = ? AND name = ?`,
        params: [folderId, CONFIG.SERVER_FILE]
      })
    ).asMappedResults();

    const fileSet = new Set(files.map((f) => f.name));

    const serverFileExists = fileSet.has(CONFIG.SERVER_FILE);

    // 3. Check script
    const [script] = (
      await query.runSuiteQL.promise({
        query: `SELECT id FROM script WHERE scriptid = ?`,
        params: [CONFIG.scriptId]
      })
    ).asMappedResults();

    const suiteletScriptExists = !!script;

    // 4. Check deployment (only if script exists)
    let suiteletDeployed = false;

    if (suiteletScriptExists) {
      const deployments = (
        await query.runSuiteQL.promise({
          query: `SELECT id FROM scriptdeployment WHERE script = ?`,
          params: [script.id]
        })
      ).asMappedResults();
      suiteletDeployed = deployments.length > 0;
    }

    // Final result
    const allReady =
      serverFileExists && suiteletScriptExists && suiteletDeployed;

    return {
      folderExists: true,
      serverFileExists,
      suiteletScriptExists,
      suiteletDeployed,
      allReady
    };
  } catch (err) {
    console.error("[CHECK_SERVER_COMPONENTS] Error:", err);
    return { error: err.message };
  }
};

window.runQuickScriptServer = async (N, { code, userId }, csrfToken) => {
  const mutation = await ensureMagicNetsuiteServerSuitelet(N, csrfToken);

  // Execute server-side script — code is passed directly in the POST body
  const execResult = await window.executeServerScript(N, {
    suiteletScriptId: "customscript" + CONFIG.SUITELET_SCRIPT_ID,
    deploymentId: "customdeploy" + CONFIG.SUITELET_SCRIPT_DEPLOY_ID,
    userId,
    code
  });

  return {
    success: true,
    logs: execResult?.logs || [],
    result: execResult?.result,
    error: execResult?.error,
    mutation
  };
};

window.renderFreemarkerTemplateServer = async (
  N,
  { template, recordType, recordId },
  csrfToken
) => {
  const mutation = await ensureMagicNetsuiteServerSuitelet(N, csrfToken);

  const renderResult = await window.executeFreemarkerTemplate(N, {
    suiteletScriptId: "customscript" + CONFIG.SUITELET_SCRIPT_ID,
    deploymentId: "customdeploy" + CONFIG.SUITELET_SCRIPT_DEPLOY_ID,
    deployUrl: mutation.deployUrl,
    template,
    recordType,
    recordId
  });

  return {
    success: !!renderResult?.success,
    pdf: renderResult?.pdf || "",
    mimeType: renderResult?.mimeType || "application/pdf",
    error: renderResult?.error,
    mutation
  };
};

async function ensureMagicNetsuiteServerSuitelet(N, csrfToken) {
  const { query } = N;

  const {
    folderExists,
    serverFileExists,
    suiteletScriptExists,
    suiteletDeployed
  } = await window.checkMagicNetsuiteComponents({ query });

  const mutation = {};

  if (!folderExists) {
    const { folderId } = await window.createFolder(N, {
      folderName: CONFIG.FOLDER_NAME,
      parentFolderId: -15,
      csrfToken
    });

    mutation.folderId = folderId;
    await waitUntilMagicFolderExists(N, mutation.folderId);
  } else {
    const [folder] = (
      await query.runSuiteQL.promise({
        query: `SELECT id FROM MediaItemFolder WHERE name = ? AND parent = -15`,
        params: [CONFIG.FOLDER_NAME]
      })
    ).asMappedResults();

    mutation.folderId = folder?.id;
  }

  if (!mutation.folderId) {
    throw new Error("Magic Netsuite scripts folder is not available yet");
  }

  const files = (
    await query.runSuiteQL.promise({
      query: `SELECT id, name FROM file WHERE folder = ? AND name = ?`,
      params: [String(mutation.folderId), CONFIG.SERVER_FILE]
    })
  ).asMappedResults();

  const fileMap = new Map(files.map((f) => [f.name, f.id]));

  if (!serverFileExists) {
    const serverResult = await window.uploadFile(N, {
      fileName: CONFIG.SERVER_FILE,
      fileContent: buildSuiteletContent(),
      folderId: mutation.folderId,
      csrfToken
    });

    mutation.serverFileId = serverResult.uploaded?.[0]?.fileId;
    const serverFile = await waitUntilMagicServerFileExists(
      N,
      mutation.folderId
    );
    mutation.serverFileId = mutation.serverFileId || serverFile?.id;
  } else {
    mutation.serverFileId = fileMap.get(CONFIG.SERVER_FILE);

    await window.updateNetsuiteFileContent(N, {
      fileId: mutation.serverFileId,
      fileContent: buildSuiteletContent(),
      fileName: CONFIG.SERVER_FILE,
      folderId: mutation.folderId
    });
    await waitUntilMagicServerFileExists(N, mutation.folderId);
  }

  if (!mutation.serverFileId) {
    throw new Error("Magic Netsuite server file is not available yet");
  }

  if (!suiteletScriptExists) {
    const { scriptRecordId } = await window.createScriptRecord(
      N,
      {
        name: CONFIG.SUITELET_SCRIPT_NAME,
        scriptId: CONFIG.SUITELET_SCRIPT_ID,
        fileId: mutation.serverFileId,
        scriptType: "SCRIPTLET",
        description:
          "Suitelet for Magic Netsuite extension server-side script execution",
        apiVersion: "2.1"
      },
      csrfToken
    );

    mutation.scriptRecordId = scriptRecordId;
    const script = await waitUntilMagicScriptExists(N);
    mutation.scriptRecordId = mutation.scriptRecordId || script?.id;
  } else {
    const [script] = (
      await query.runSuiteQL.promise({
        query: `SELECT id FROM script WHERE scriptid = ?`,
        params: [CONFIG.scriptId]
      })
    ).asMappedResults();

    mutation.scriptRecordId = script?.id;
  }

  if (!mutation.scriptRecordId) {
    throw new Error("Magic Netsuite Suitelet script is not available yet");
  }

  if (!suiteletDeployed) {
    const { deployUrl } = await window.createScriptDeployRecord(N, {
      name: CONFIG.SUITELET_DEPLOYMENT_NAME,
      scriptId: CONFIG.SUITELET_SCRIPT_DEPLOY_ID,
      scriptInternalId: mutation.scriptRecordId,
      title: CONFIG.SUITELET_DEPLOYMENT_NAME,
      status: "RELEASED",
      logLevel: "DEBUG"
    });

    mutation.deployUrl = deployUrl;
    await waitUntilMagicDeploymentExists(N, mutation.scriptRecordId);
  }

  await waitForMagicNetsuiteServerReady(N, mutation.deployUrl);

  return mutation;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getMagicNetsuiteServerUrl(N, deployUrl) {
  const { url } = N;
  const domain = url.resolveDomain({
    hostType: url.HostType.APPLICATION
  });

  const normalizeSuiteletUrl = (value) => {
    if (!value) return "";

    let normalized = String(value).trim();
    normalized = normalized.replace(/^https\/\//i, "https://");
    normalized = normalized.replace(/^http\/\//i, "http://");

    if (/^https?:\/\//i.test(normalized)) return normalized;
    if (normalized.startsWith("//")) return `https:${normalized}`;
    if (!normalized.startsWith("/")) normalized = `/${normalized}`;

    return `https://${domain}${normalized}`;
  };

  return normalizeSuiteletUrl(
    deployUrl ||
    url.resolveScript({
      scriptId: "customscript" + CONFIG.SUITELET_SCRIPT_ID,
      deploymentId: "customdeploy" + CONFIG.SUITELET_SCRIPT_DEPLOY_ID,
      returnExternalUrl: false
    })
  );
}

async function waitForMagicNetsuiteServerReady(N, deployUrl) {
  const fullUrl = getMagicNetsuiteServerUrl(N, deployUrl);
  let lastError = "";

  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const response = await fetch(fullUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: "action=pingMagicServer",
        credentials: "include"
      });

      if (response.ok) {
        const text = await response.text();
        const result = JSON.parse(text);
        if (result?.success && result?.ready) return;
        lastError = result?.error || text;
      } else {
        lastError = `HTTP ${response.status}`;
      }
    } catch (err) {
      lastError = err?.message || String(err);
    }

    await sleep(750);
  }

  throw new Error(`Magic Netsuite server Suitelet is not ready yet: ${lastError}`);
}

async function waitUntilSuiteQL(
  N,
  queryText,
  params,
  predicate,
  label,
  timeoutMs = 10000
) {
  const startedAt = Date.now();
  let lastError = "";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const rows = (
        await N.query.runSuiteQL.promise({
          query: queryText,
          params
        })
      ).asMappedResults();

      if (predicate(rows)) return rows;
    } catch (err) {
      lastError = err?.message || String(err);
    }

    await sleep(500);
  }

  throw new Error(
    `${label} did not settle before timeout${lastError ? `: ${lastError}` : ""}`
  );
}

async function waitUntilMagicScriptDeleted(N) {
  await waitUntilSuiteQL(
    N,
    `SELECT id FROM script WHERE scriptid = ?`,
    [CONFIG.scriptId],
    (rows) => rows.length === 0,
    "Suitelet script deletion"
  );
}

async function waitUntilMagicFolderExists(N, folderId) {
  const [folder] = await waitUntilSuiteQL(
    N,
    `SELECT id FROM MediaItemFolder WHERE id = ?`,
    [String(folderId)],
    (rows) => rows.length > 0,
    "Scripts folder creation"
  );

  return folder;
}

async function waitUntilMagicServerFileExists(N, folderId) {
  const [serverFile] = await waitUntilSuiteQL(
    N,
    `SELECT id FROM file WHERE folder = ? AND name = ?`,
    [String(folderId), CONFIG.SERVER_FILE],
    (rows) => rows.length > 0,
    "Server file creation"
  );

  return serverFile;
}

async function waitUntilMagicScriptExists(N) {
  const [script] = await waitUntilSuiteQL(
    N,
    `SELECT id FROM script WHERE scriptid = ?`,
    [CONFIG.scriptId],
    (rows) => rows.length > 0,
    "Suitelet script creation"
  );

  return script;
}

async function waitUntilMagicDeploymentExists(N, scriptRecordId) {
  const [deployment] = await waitUntilSuiteQL(
    N,
    `SELECT id FROM scriptdeployment WHERE script = ?`,
    [String(scriptRecordId)],
    (rows) => rows.length > 0,
    "Suitelet deployment creation"
  );

  return deployment;
}

async function waitUntilMagicServerFileDeleted(N, folderId) {
  await waitUntilSuiteQL(
    N,
    `SELECT id FROM file WHERE folder = ? AND name = ?`,
    [String(folderId), CONFIG.SERVER_FILE],
    (rows) => rows.length === 0,
    "Server file deletion"
  );
}

async function waitUntilMagicScriptsFolderDeleted(N, folderId) {
  await waitUntilSuiteQL(
    N,
    `SELECT id FROM MediaItemFolder WHERE id = ?`,
    [String(folderId)],
    (rows) => rows.length === 0,
    "Scripts folder deletion"
  );
}

/**
 * Create a script deployment
 * @param {object} N - NetSuite modules
 * @param {string} scriptRecordId - Internal ID of the script record
 * @param {string} deploymentId - Deployment script ID
 * @param {string} title - Deployment title
 * @returns {Promise<{deploymentId: string|null}>}
 */
window.createScriptDeployment = async (
  N,
  scriptRecordId,
  deploymentId,
  title
) => {
  const { url } = N;
  const domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
  const csrfToken = document.querySelector('input[name="_csrf"]')?.value;

  const body = `submitter=Save&scripttype=scriptdeployment&name=${encodeURIComponent(
    title
  )}&scriptid=${encodeURIComponent(
    deploymentId
  )}&script=${scriptRecordId}&isdeployed=T&status=RELEASED&loglevel=DEBUG&_csrf=${encodeURIComponent(
    csrfToken
  )}&nsapiCT=${Date.now()}&type=scriptdeployment&id=&externalid=&whence=${encodeURIComponent(
    `/app/common/scripting/scriptdeployment.nl`
  )}`;

  try {
    const response = await fetch(
      `${domain}/app/common/scripting/scriptdeployment.nl`,
      {
        method: "POST",
        credentials: "include",
        mode: "cors",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "it-IT,it;q=0.6",
          "cache-control": "max-age=0",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "same-origin",
          "sec-fetch-user": "?1",
          "upgrade-insecure-requests": "1"
        },
        referrer: `https://${domain}/app/common/scripting/scriptdeployment.nl`,
        body
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create deployment: ${response.status}`);
    }

    const html = await response.text();
    const extractedId = extractDeploymentIdFromHtml(html);

    return { deploymentId: extractedId || deploymentId };
  } catch (error) {
    console.error("[createScriptDeployment]", error);
    throw error;
  }
};

/**
 * Execute server-side script via suitelet
 * @param {object} N - NetSuite modules
 * @param {string} suiteletScriptId - Suitelet script ID
 * @param {string} deploymentId - Deployment ID
 * @param {string} userId - Extension user ID
 * @returns {Promise<any>}
 */
window.executeServerScript = async (
  N,
  { suiteletScriptId, deploymentId, userId, deployUrl, code }
) => {
  const { url } = N;

  try {
    const fullUrl = getMagicNetsuiteServerUrl(
      N,
      deployUrl ||
        url.resolveScript({
          scriptId: suiteletScriptId,
          deploymentId: deploymentId,
          returnExternalUrl: false
        })
    );

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: `action=${encodeURIComponent(userId)}&code=${encodeURIComponent(code)}`,
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error(`Server script failed: ${response.status}`);
    }

    // Read body once as text then parse — avoids "body stream already read" error
    const responseText = await response.text();
    console.log("[executeServerScript] Raw response:", responseText);

    const result = JSON.parse(responseText);
    return result;
  } catch (error) {
    console.error("[executeServerScript]", error);
    throw error;
  }
};

window.executeFreemarkerTemplate = async (
  N,
  { suiteletScriptId, deploymentId, deployUrl, template, recordType, recordId }
) => {
  const { url } = N;

  try {
    const fullUrl = getMagicNetsuiteServerUrl(N, deployUrl);
    const body = new URLSearchParams();
    body.set("action", "renderFreemarker");
    body.set("template", template);
    if (recordType && recordId) {
      body.set("recordType", recordType);
      body.set("recordId", recordId);
    }

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: body.toString(),
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error(`FreeMarker render failed: ${response.status}`);
    }

    const responseText = await response.text();
    return JSON.parse(responseText);
  } catch (error) {
    console.error("[executeFreemarkerTemplate]", error);
    throw error;
  }
};

/**
 * Remove all Magic Netsuite server-side components
 * @param {object} N - NetSuite modules
 * @returns {Promise<{removed: string[]}>}
 */
window.removeMagicNetsuiteComponents = async (N, {}, csrfToken) => {
  const { query } = N;
  /** @type {{name: string, status: 'removed'|'skipped'|'error', error?: string}[]} */
  const steps = [];

  const addStep = (name, status, error) => {
    steps.push(error !== undefined ? { name, status, error } : { name, status });
  };

  // ── Script ──────────────────────────────────────────────────────────────
  try {
    const [{ id: scriptId } = {}] = (
      await query.runSuiteQL.promise({
        query: `SELECT id FROM script WHERE scriptid = ?`,
        params: [CONFIG.scriptId]
      })
    ).asMappedResults();

    if (scriptId) {
      await window.deleteNetsuiteScript(
        N,
        {
          scriptId,
          scriptName: "Magic Netsuite Server",
          apiVersion: "2.1",
          defaultFunction: "onRequest"
        },
        csrfToken
      );
      await waitUntilMagicScriptDeleted(N);
      addStep("Suitelet Script", "removed");
    } else {
      addStep("Suitelet Script", "skipped");
    }
  } catch (err) {
    addStep("Suitelet Script", "error", String(err));
  }

  // ── Folder + files ───────────────────────────────────────────────────────
  let folderId;
  try {
    const [{ id } = {}] = (
      await query.runSuiteQL.promise({
        query: `SELECT id FROM MediaItemFolder WHERE name = ? AND parent = -15`,
        params: [CONFIG.FOLDER_NAME]
      })
    ).asMappedResults();
    folderId = id;
  } catch (err) {
    addStep("Folder Lookup", "error", String(err));
    return { steps };
  }

  if (!folderId) {
    addStep("Server File", "skipped");
    addStep("Scripts Folder", "skipped");
    return { steps };
  }

  // ── Server file ──────────────────────────────────────────────────────────
  try {
    const [{ id: serverFileId } = {}] = (
      await query.runSuiteQL.promise({
        query: `SELECT id FROM file WHERE folder = ? AND name = ?`,
        params: [String(folderId), CONFIG.SERVER_FILE]
      })
    ).asMappedResults();

    if (serverFileId) {
      await window.deleteNetsuiteFile(
        N,
        { fileId: serverFileId, folderId },
        csrfToken
      );
      await waitUntilMagicServerFileDeleted(N, folderId);
      addStep("Server File", "removed");
    } else {
      addStep("Server File", "skipped");
    }
  } catch (err) {
    addStep("Server File", "error", String(err));
  }

  // ── Folder ───────────────────────────────────────────────────────────────
  try {
    await window.deleteFolder(N, { folderId });
    await waitUntilMagicScriptsFolderDeleted(N, folderId);
    addStep("Scripts Folder", "removed");
  } catch (err) {
    addStep("Scripts Folder", "error", String(err));
  }

  return { steps };
};

// ─── Helper Functions ──────────────────────────────────────────────────────────

function buildSuiteletContent() {
  return `/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 * Executes user-submitted code passed in the POST body.
 * Each request is self-contained via new Function(),
 * so multiple users can run scripts concurrently without conflicts.
 */
define(
  [
    'N/record', 'N/search', 'N/query', 'N/log', 'N/file', 'N/url', 'N/runtime',
    'N/format', 'N/email', 'N/render', 'N/task', 'N/workflow',
    'N/https', 'N/http', 'N/encode', 'N/error', 'N/xml',
    'N/currency', 'N/transaction', 'N/redirect'
  ],
  (record, search, query, log, file, url, runtime,
   format, email, render, task, workflow,
   https, http, encode, nsError, xml,
   currency, transaction, redirect) => {

  var __serialize = function(a) {
    try { return typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a); }
    catch(e) { return String(a); }
  };

  var executeUserCode = function(code, N) {
    var __logs = [];
    var fakeConsole = {
      log:   function() { __logs.push({ type: 'log',   values: Array.prototype.slice.call(arguments).map(__serialize) }); },
      warn:  function() { __logs.push({ type: 'warn',  values: Array.prototype.slice.call(arguments).map(__serialize) }); },
      error: function() { __logs.push({ type: 'error', values: Array.prototype.slice.call(arguments).map(__serialize) }); },
      info:  function() { __logs.push({ type: 'log',   values: Array.prototype.slice.call(arguments).map(__serialize) }); }
    };
    var __result;
    try {
      // Build a function from the user's code string and execute it with
      // NetSuite modules injected as named parameters.
      var userFn = new Function(
        'record', 'search', 'query', 'log', 'file', 'url', 'runtime',
        'format', 'email', 'render', 'task', 'workflow',
        'https', 'http', 'encode', 'error', 'xml',
        'currency', 'transaction', 'redirect',
        'context', 'console',
        code
      );
      __result = userFn(
        N.record, N.search, N.query, N.log, N.file, N.url, N.runtime,
        N.format, N.email, N.render, N.task, N.workflow,
        N.https, N.http, N.encode, N.nsError, N.xml,
        N.currency, N.transaction, N.redirect,
        N.context, fakeConsole
      );
    } catch (__err) {
      __logs.push({ type: 'error', values: [__err.message || String(__err)] });
    }
    return { logs: __logs, result: __result };
  };

  var renderFreemarkerTemplate = function(template, recordType, recordId) {
    var renderer = render.create();
    renderer.templateContent = template;
    if (recordType && recordId) {
      renderer.addRecord({
        templateName: 'record',
        record: record.load({
          type: recordType,
          id: recordId
        })
      });
    }
    return renderer.renderAsPdf();
  };

  var onRequest = function(context) {
    try {
      if (context.request.method !== 'POST') {
        context.response.write(JSON.stringify({ success: false, error: 'Only POST requests are supported', logs: [] }));
        return;
      }

      var action = context.request.parameters.action;
      if (!action) {
        context.response.write(JSON.stringify({ success: false, error: 'Missing action parameter', logs: [] }));
        return;
      }

      if (action === 'pingMagicServer') {
        context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
        context.response.write(JSON.stringify({ success: true, ready: true }));
        return;
      }

      if (action === 'renderFreemarker') {
        var template = context.request.parameters.template;
        if (!template) {
          context.response.write(JSON.stringify({ success: false, error: 'Missing template parameter' }));
          return;
        }

        try {
          var pdfFile = renderFreemarkerTemplate(
            template,
            context.request.parameters.recordType,
            context.request.parameters.recordId
          );
          context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
          context.response.write(JSON.stringify({
            success: true,
            mimeType: 'application/pdf',
            pdf: pdfFile.getContents()
          }));
        } catch (renderError) {
          context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
          context.response.write(JSON.stringify({
            success: false,
            error: renderError.message || String(renderError)
          }));
        }
        return;
      }

      var code = context.request.parameters.code;
      if (!code) {
        context.response.write(JSON.stringify({ success: false, error: 'Missing code parameter — please re-run from the extension', logs: [] }));
        return;
      }

      var N = {
        record: record, search: search, query: query, log: log, file: file, url: url, runtime: runtime,
        format: format, email: email, render: render, task: task, workflow: workflow,
        https: https, http: http, encode: encode, nsError: nsError, xml: xml,
        currency: currency, transaction: transaction, redirect: redirect,
        context: context
      };
      var execResult = executeUserCode(code, N);
      context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
      context.response.write(JSON.stringify({
        success: true,
        logs: execResult.logs || [],
        result: execResult.result
      }));
    } catch (error) {
      context.response.write(JSON.stringify({
        success: false,
        error: error.message || String(error),
        logs: []
      }));
    }
  };

  return { onRequest };
});`;
}

function extractDeploymentIdFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const idInput = doc.querySelector('input[name="id"]');
  if (idInput && idInput.value) return idInput.value;

  const m = html.match(/scriptdeployment\.nl\?id=(\d+)/);
  if (m) return m[1];

  return null;
}
