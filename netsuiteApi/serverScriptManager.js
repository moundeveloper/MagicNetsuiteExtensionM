/**
 * Server Script Manager - Manages folder, files, script records, and deployments
 * for server-side Quick Script execution
 */

const CONFIG = {
  FOLDER_NAME: "MagicNetsuiteScripts",
  HANDLER_FILE: "magic_netsuite_handlers.js",
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
        handlerFileExists: false,
        serverFileExists: false,
        suiteletScriptExists: false,
        suiteletDeployed: false,
        allReady: false
      };
    }

    const folderId = folder.id;

    // 2. Check both files in one query
    const files = (
      await query.runSuiteQL.promise({
        query: `SELECT name FROM file WHERE folder = ? AND name IN (?, ?)`,
        params: [folderId, CONFIG.HANDLER_FILE, CONFIG.SERVER_FILE]
      })
    ).asMappedResults();

    const fileSet = new Set(files.map((f) => f.name));

    const handlerFileExists = fileSet.has(CONFIG.HANDLER_FILE);
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
      handlerFileExists,
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
  const { query } = N;

  const {
    folderExists,
    handlerFileExists,
    serverFileExists,
    suiteletScriptExists,
    suiteletDeployed
  } = await window.checkMagicNetsuiteComponents({ query });

  const mutation = {};

  // -------------------------
  // FOLDER
  // -------------------------
  if (!folderExists) {
    const { folderId } = await window.createFolder(N, {
      folderName: CONFIG.FOLDER_NAME,
      parentFolderId: -15,
      csrfToken
    });

    mutation.folderId = folderId;
  } else {
    // hydrate existing folder
    const [folder] = (
      await query.runSuiteQL.promise({
        query: `SELECT id FROM MediaItemFolder WHERE name = ? AND parent = -15`,
        params: [CONFIG.FOLDER_NAME]
      })
    ).asMappedResults();

    mutation.folderId = folder?.id;
  }

  console.log("mutation", mutation);

  // -------------------------
  // FILES
  // -------------------------
  const files = (
    await query.runSuiteQL.promise({
      query: `SELECT id, name FROM file WHERE folder = ? AND name = ?`,
      params: [mutation.folderId, CONFIG.SERVER_FILE]
    })
  ).asMappedResults();

  console.log("files", files);

  const fileMap = new Map(files.map((f) => [f.name, f.id]));

  // Server file
  if (!serverFileExists) {
    const suiteletContent = buildSuiteletContent();
    const serverResult = await window.uploadFile(N, {
      fileName: CONFIG.SERVER_FILE,
      fileContent: suiteletContent,
      folderId: mutation.folderId,
      csrfToken
    });

    const serverFileId = serverResult.uploaded?.[0]?.fileId;

    mutation.serverFileId = serverFileId;
  } else {
    mutation.serverFileId = fileMap.get(CONFIG.SERVER_FILE);

    // Always refresh the server file so the deployed suitelet stays current.
    const suiteletContent = buildSuiteletContent();
    await window.updateNetsuiteFileContent(N, {
      fileId: mutation.serverFileId,
      fileContent: suiteletContent,
      fileName: CONFIG.SERVER_FILE,
      folderId: mutation.folderId
    });
  }

  console.log("mutation", mutation);

  // -------------------------
  // SCRIPT
  // -------------------------
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
  } else {
    const [script] = (
      await query.runSuiteQL.promise({
        query: `SELECT id FROM script WHERE scriptid = ?`,
        params: [CONFIG.scriptId]
      })
    ).asMappedResults();

    mutation.scriptRecordId = script?.id;
  }

  console.log("mutation", mutation);

  // -------------------------
  // DEPLOYMENT
  // -------------------------
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
  }

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
    const suiteletUrl =
      deployUrl ||
      url.resolveScript({
        scriptId: suiteletScriptId,
        deploymentId: deploymentId,
        returnExternalUrl: false
      });

    const fullUrl = `https://${url.resolveDomain({
      hostType: url.HostType.APPLICATION
    })}${suiteletUrl}`;

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

/**
 * Remove all Magic Netsuite server-side components
 * @param {object} N - NetSuite modules
 * @returns {Promise<{removed: string[]}>}
 */
window.removeMagicNetsuiteComponents = async (N, {}, csrfToken) => {
  try {
    const { query, record } = N;
    const removed = [];

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

      removed.push("Script");
    }

    const [{ id: folderId } = {}] = (
      await query.runSuiteQL.promise({
        query: `SELECT id FROM MediaItemFolder WHERE name = ? AND parent = -15`,
        params: [CONFIG.FOLDER_NAME]
      })
    ).asMappedResults();

    const [{ id: serverFileId } = {}] = (
      await query.runSuiteQL.promise({
        query: `SELECT id FROM file WHERE folder = ? AND name = ?`,
        params: [folderId, CONFIG.SERVER_FILE]
      })
    ).asMappedResults();

    console.log("removing", {
      folderId,
      serverFileId
    });

    if (serverFileId) {
      await window.deleteNetsuiteFile(
        N,
        {
          fileId: serverFileId,
          folderId
        },
        csrfToken
      );

      removed.push("Server File");
    }

    const [{ id: handlerFileId } = {}] = (
      await query.runSuiteQL.promise({
        query: `SELECT id FROM file WHERE folder = ? AND name = ?`,
        params: [folderId, CONFIG.HANDLER_FILE]
      })
    ).asMappedResults();

    if (handlerFileId) {
      await window.deleteNetsuiteFile(
        N,
        {
          fileId: handlerFileId,
          folderId
        },
        csrfToken
      );

      removed.push("Handler File");
    }

    if (folderId) {
      window.deleteFolder(N, { folderId });

      removed.push("Folder");
    }

    return removed;
  } catch (error) {}
};

// ─── Helper Functions ──────────────────────────────────────────────────────────

function buildSuiteletContent() {
  return `/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 * Executes user-submitted code passed in the POST body.
 * No shared handler file is used — each request is self-contained,
 * so multiple users can run scripts concurrently without conflicts.
 */
define(
  ['N/record', 'N/search', 'N/query', 'N/log', 'N/file', 'N/url', 'N/runtime'],
  (record, search, query, log, file, url, runtime) => {

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
      // NetSuite modules injected as named parameters — identical to the
      // previous handler-file approach but without requiring a file write.
      var userFn = new Function(
        'record', 'search', 'query', 'log', 'file', 'url', 'runtime', 'context', 'console',
        code
      );
      __result = userFn(
        N.record, N.search, N.query, N.log, N.file, N.url, N.runtime, N.context, fakeConsole
      );
    } catch (__err) {
      __logs.push({ type: 'error', values: [__err.message || String(__err)] });
    }
    return { logs: __logs, result: __result };
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

      var code = context.request.parameters.code;
      if (!code) {
        context.response.write(JSON.stringify({ success: false, error: 'Missing code parameter — please re-run from the extension', logs: [] }));
        return;
      }

      var N = { record: record, search: search, query: query, log: log, file: file, url: url, runtime: runtime, context: context };
      var handlerResult = executeUserCode(code, N);
      context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
      context.response.write(JSON.stringify({
        success: true,
        logs: handlerResult.logs || [],
        result: handlerResult.result
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
