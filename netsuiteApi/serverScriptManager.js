/**
 * Server Script Manager - Manages folder, files, script records, and deployments
 * for server-side Quick Script execution
 */

const CONFIG = {
  FOLDER_NAME: "MagicNetsuiteScripts",
  SERVER_FILE: "magic_netsuite_server.js",
  MCP_SERVER_FILE: "magic_netsuite_mcp_server.js",
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
        query: `SELECT name FROM file WHERE folder = ? AND name IN (?, ?)`,
        params: [folderId, CONFIG.SERVER_FILE, CONFIG.MCP_SERVER_FILE]
      })
    ).asMappedResults();

    const fileSet = new Set(files.map((f) => f.name));

    const serverFileExists = fileSet.has(CONFIG.SERVER_FILE);
    const mcpServerFileExists = fileSet.has(CONFIG.MCP_SERVER_FILE);

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
          query: `SELECT primarykey AS id FROM scriptdeployment WHERE script = ?`,
          params: [script.id]
        })
      ).asMappedResults();
      suiteletDeployed = deployments.length > 0;
    }

    // Final result
    const allReady =
      serverFileExists && mcpServerFileExists && suiteletScriptExists && suiteletDeployed;

    return {
      folderExists: true,
      serverFileExists,
      mcpServerFileExists,
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

window.deployMagicNetsuiteComponents = async (N, _payload, csrfToken) => {
  const before = await window.checkMagicNetsuiteComponents(N);
  const mutation = await ensureMagicNetsuiteServerSuitelet(N, csrfToken);
  const after = await window.checkMagicNetsuiteComponents(N);

  return {
    success: !after?.error && after?.allReady === true,
    before,
    after,
    mutation
  };
};

async function ensureMagicNetsuiteServerSuitelet(N, csrfToken) {
  const { query } = N;

  const {
    folderExists,
    serverFileExists,
    mcpServerFileExists,
    suiteletScriptExists,
    suiteletDeployed
  } = await window.checkMagicNetsuiteComponents({ query });

  const mutation = {};

  if (!folderExists) {
    try {
      const { folderId } = await window.createFolder(N, {
        folderName: CONFIG.FOLDER_NAME,
        parentFolderId: -15,
        csrfToken
      });

      mutation.folderId = folderId;
      await waitUntilMagicFolderExists(N, mutation.folderId);
    } catch (err) {
      console.warn(
        "[DEPLOY_SERVER_COMPONENTS] Folder creation failed; checking whether NetSuite created or already has the folder.",
        err
      );

      const folder = await waitUntilMagicFolderByName(N).catch(() => null);
      if (!folder?.id) {
        throw err;
      }

      mutation.folderId = folder.id;
      mutation.folderCreationRecovered = true;
    }
  } else {
    const folder = await findMagicFolderByName(N);
    mutation.folderId = folder?.id;
  }

  if (!mutation.folderId) {
    throw new Error("Magic Netsuite scripts folder is not available yet");
  }

  const files = (
    await query.runSuiteQL.promise({
      query: `SELECT id, name FROM file WHERE folder = ? AND name IN (?, ?)`,
      params: [String(mutation.folderId), CONFIG.SERVER_FILE, CONFIG.MCP_SERVER_FILE]
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

  if (!mcpServerFileExists) {
    const mcpResult = await window.uploadFile(N, {
      fileName: CONFIG.MCP_SERVER_FILE,
      fileContent: buildMcpServerModuleContent(),
      folderId: mutation.folderId,
      csrfToken
    });

    mutation.mcpServerFileId = mcpResult.uploaded?.[0]?.fileId;
    const mcpServerFile = await waitUntilMagicMcpServerFileExists(
      N,
      mutation.folderId
    );
    mutation.mcpServerFileId = mutation.mcpServerFileId || mcpServerFile?.id;
  } else {
    mutation.mcpServerFileId = fileMap.get(CONFIG.MCP_SERVER_FILE);

    await window.updateNetsuiteFileContent(N, {
      fileId: mutation.mcpServerFileId,
      fileContent: buildMcpServerModuleContent(),
      fileName: CONFIG.MCP_SERVER_FILE,
      folderId: mutation.folderId
    });
    await waitUntilMagicMcpServerFileExists(N, mutation.folderId);
  }

  if (!mutation.mcpServerFileId) {
    throw new Error("Magic Netsuite MCP server module file is not available yet");
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

async function findMagicFolderByName(N) {
  const folders = (
    await N.query.runSuiteQL.promise({
      query: `
        SELECT id, parent
        FROM MediaItemFolder
        WHERE name = ?
        ORDER BY CASE WHEN parent = -15 THEN 0 ELSE 1 END, id DESC
      `,
      params: [CONFIG.FOLDER_NAME]
    })
  ).asMappedResults();

  return folders[0] || null;
}

async function waitUntilMagicFolderByName(N) {
  const [folder] = await waitUntilSuiteQL(
    N,
    `
      SELECT id, parent
      FROM MediaItemFolder
      WHERE name = ?
      ORDER BY CASE WHEN parent = -15 THEN 0 ELSE 1 END, id DESC
    `,
    [CONFIG.FOLDER_NAME],
    (rows) => rows.length > 0,
    "Scripts folder lookup"
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

async function waitUntilMagicMcpServerFileExists(N, folderId) {
  const [mcpServerFile] = await waitUntilSuiteQL(
    N,
    `SELECT id FROM file WHERE folder = ? AND name = ?`,
    [String(folderId), CONFIG.MCP_SERVER_FILE],
    (rows) => rows.length > 0,
    "MCP server module file creation"
  );

  return mcpServerFile;
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
    `SELECT primarykey AS id FROM scriptdeployment WHERE script = ?`,
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

async function waitUntilMagicMcpServerFileDeleted(N, folderId) {
  await waitUntilSuiteQL(
    N,
    `SELECT id FROM file WHERE folder = ? AND name = ?`,
    [String(folderId), CONFIG.MCP_SERVER_FILE],
    (rows) => rows.length === 0,
    "MCP server module file deletion"
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

// window.createScriptDeployment was removed (dead code): deployments are now
// created by the SDF deploy companion (sdf_tool/sdfDeploy.exe). The internal
// server-component deploy flow still uses window.createScriptDeployRecord.

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

  // ── Server files ─────────────────────────────────────────────────────────
  try {
    const files = (
      await query.runSuiteQL.promise({
        query: `SELECT id, name FROM file WHERE folder = ? AND name IN (?, ?)`,
        params: [String(folderId), CONFIG.SERVER_FILE, CONFIG.MCP_SERVER_FILE]
      })
    ).asMappedResults();

    const serverFileId = files.find((f) => f.name === CONFIG.SERVER_FILE)?.id;
    const mcpServerFileId = files.find((f) => f.name === CONFIG.MCP_SERVER_FILE)?.id;

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

    if (mcpServerFileId) {
      await window.deleteNetsuiteFile(
        N,
        { fileId: mcpServerFileId, folderId },
        csrfToken
      );
      await waitUntilMagicMcpServerFileDeleted(N, folderId);
      addStep("MCP Server Module", "removed");
    } else {
      addStep("MCP Server Module", "skipped");
    }
  } catch (err) {
    addStep("Server Files", "error", String(err));
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

function buildMcpServerModuleContent() {
  return `/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(
  [
    'N/file', 'N/query', 'N/record', 'N/runtime', 'N/task', 'N/search', 'N/log', 'N/url',
    'N/format', 'N/email', 'N/render', 'N/https', 'N/http', 'N/encode', 'N/error',
    'N/xml', 'N/workflow', 'N/currency', 'N/transaction', 'N/redirect'
  ],
  function(file, query, record, runtime, task, search, log, url,
    format, email, render, https, http, encode, nsError,
    xml, workflow, currency, transaction, redirect) {
  var textResult = function(value) {
    return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
  };

  var parseId = function(value, name) {
    var id = parseInt(String(value == null ? '' : value), 10);
    if (isNaN(id)) throw new Error(name + ' must be numeric.');
    return id;
  };

  var runSuiteQL = function(sql, params) {
    return query.runSuiteQL({ query: sql, params: params || [] }).asMappedResults();
  };

  var escapeSqlLike = function(value) {
    return String(value == null ? '' : value).replace(/'/g, "''");
  };

  var normalizeScriptSuffix = function(value, prefix) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    raw = raw.replace(new RegExp('^' + prefix + '_?', 'i'), '');
    raw = raw.replace(/^_+/, '');
    return '_' + raw.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  };

  var setIfPresent = function(rec, fieldId, value) {
    if (value !== undefined && value !== null && value !== '') {
      rec.setValue({ fieldId: fieldId, value: value });
    }
  };

  var applyValues = function(rec, values) {
    Object.keys(values || {}).forEach(function(fieldId) {
      rec.setValue({ fieldId: fieldId, value: values[fieldId] });
    });
  };

  var tryCreateRecord = function(types, values, sublistWriter) {
    var lastError = null;
    for (var i = 0; i < types.length; i += 1) {
      try {
        var rec = record.create({ type: types[i], isDynamic: true });
        applyValues(rec, values);
        if (sublistWriter) sublistWriter(rec, types[i]);
        return { id: rec.save({ enableSourcing: true, ignoreMandatoryFields: false }), recordType: types[i] };
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('Unable to create record.');
  };

  var tryLoadRecord = function(types, id) {
    var lastError = null;
    for (var i = 0; i < types.length; i += 1) {
      try {
        return { rec: record.load({ type: types[i], id: id, isDynamic: true }), recordType: types[i] };
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('Unable to load record.');
  };

  var getSelectOptions = function(recordType, fieldId, filter) {
    var rec = record.create({ type: recordType, isDynamic: true });
    var fld = rec.getField({ fieldId: fieldId });
    return fld ? fld.getSelectOptions({ filter: filter || '', operator: 'contains' }) : [];
  };

  var executeQuickScript = function(code) {
    var logs = [];
    var stringify = function(value) {
      try { return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value); }
      catch (e) { return String(value); }
    };
    var fakeConsole = {
      log: function() { logs.push({ type: 'log', values: Array.prototype.slice.call(arguments).map(stringify) }); },
      warn: function() { logs.push({ type: 'warn', values: Array.prototype.slice.call(arguments).map(stringify) }); },
      error: function() { logs.push({ type: 'error', values: Array.prototype.slice.call(arguments).map(stringify) }); },
      info: function() { logs.push({ type: 'log', values: Array.prototype.slice.call(arguments).map(stringify) }); }
    };
    var fn = new Function(
      'record', 'search', 'query', 'log', 'file', 'url', 'runtime',
      'format', 'email', 'render', 'task', 'workflow',
      'https', 'http', 'encode', 'error', 'xml',
      'currency', 'transaction', 'redirect', 'console',
      code
    );
    var result = fn(
      record, search, query, log, file, url, runtime,
      format, email, render, task, workflow,
      https, http, encode, nsError, xml,
      currency, transaction, redirect, fakeConsole
    );
    return { logs: logs, result: result };
  };

  var serializeRecord = function(rec) {
    var fields = {};
    rec.getFields().forEach(function(fieldId) {
      var value = null;
      var text = null;
      try { value = rec.getValue({ fieldId: fieldId }); } catch (_) {}
      try { text = rec.getText({ fieldId: fieldId }); } catch (_) {}
      fields[fieldId] = { value: value, text: text };
    });
    return { id: rec.id, type: rec.type, fields: fields };
  };

  var fileTypeFromName = function(name, fallback) {
    var ext = String(name || '').split('.').pop().toLowerCase();
    var map = {
      js: file.Type.JAVASCRIPT,
      json: file.Type.JSON,
      html: file.Type.HTMLDOC,
      htm: file.Type.HTMLDOC,
      xml: file.Type.XMLDOC,
      csv: file.Type.CSV,
      txt: file.Type.PLAINTEXT,
      ftl: file.Type.PLAINTEXT,
      css: file.Type.STYLESHEET,
      pdf: file.Type.PDF
    };
    return fallback || map[ext] || file.Type.PLAINTEXT;
  };

  var getRecordSublists = function(args) {
    var rec = record.load({ type: String(args.recordType || args.type), id: String(args.recordId || args.id), isDynamic: false });
    var requested = Array.isArray(args.sublistIds) && args.sublistIds.length ? args.sublistIds.map(String) : rec.getSublists();
    var sublists = {};
    requested.forEach(function(sublistId) {
      var fields = rec.getSublistFields({ sublistId: sublistId });
      var lineCount = rec.getLineCount({ sublistId: sublistId });
      var rows = [];
      for (var line = 0; line < lineCount; line += 1) {
        var row = {};
        fields.forEach(function(fieldId) {
          var value = null;
          var text = null;
          try { value = rec.getSublistValue({ sublistId: sublistId, fieldId: fieldId, line: line }); } catch (_) {}
          try { text = rec.getSublistText({ sublistId: sublistId, fieldId: fieldId, line: line }); } catch (_) {}
          row[fieldId] = { value: value, text: text };
        });
        rows.push(row);
      }
      sublists[sublistId] = { lineCount: lineCount, fields: fields, rows: rows };
    });
    return { recordType: args.recordType || args.type, recordId: args.recordId || args.id, sublists: sublists };
  };

  var saveFileReplacement = function(args, renameOnly) {
    var updateFileId = parseId(args.fileId, 'fileId');
    var existing = file.load({ id: updateFileId });
    var replacement = file.create({
      name: renameOnly ? String(args.newName || '') : (args.fileName || existing.name),
      fileType: fileTypeFromName(args.fileName || existing.name, args.mediaType || existing.fileType),
      contents: renameOnly ? existing.getContents() : args.fileContent,
      folder: args.folderId == null ? existing.folder : parseId(args.folderId, 'folderId'),
      isOnline: existing.isOnline
    });
    replacement.id = updateFileId;
    return { fileId: replacement.save(), updated: true };
  };

  var handlers = {
    suiteql_search_tables: function(args) {
      var term = String(args.query || '').toLowerCase();
      var rows = [];
      try {
        rows = runSuiteQL("SELECT table_name AS id, remarks AS label FROM oa_tables WHERE table_type = 'TABLE' ORDER BY table_name");
      } catch (e) {
        rows = runSuiteQL("SELECT table_name AS id, table_name AS label FROM oa_tables ORDER BY table_name");
      }
      var filtered = term ? rows.filter(function(row) {
        return String(row.id || '').toLowerCase().indexOf(term) >= 0 || String(row.label || '').toLowerCase().indexOf(term) >= 0;
      }) : rows;
      return { total: rows.length, matched: filtered.length, tables: filtered.slice(0, 50) };
    },
    suiteql_get_table_fields: function(args) {
      var tableName = String(args.tableName || '');
      var fields = runSuiteQL(
        "SELECT column_name AS id, remarks AS label, type_name AS dataType FROM oa_columns WHERE LOWER(table_name) = LOWER(?) ORDER BY ordinal_position",
        [tableName]
      ).map(function(row) {
        return { id: row.id, label: row.label || row.id, dataType: row.datatype || row.dataType };
      });
      return { table: tableName, fieldCount: fields.length, fields: fields };
    },
    suiteql_get_table_joins: function(args) {
      var tableName = String(args.tableName || '');
      var joins = [];
      try {
        joins = runSuiteQL(
          "SELECT fkcolumn_name AS id, pktable_name AS targetTable, pkcolumn_name AS joinCondition FROM oa_fkeys WHERE LOWER(fktable_name) = LOWER(?) ORDER BY pktable_name",
          [tableName]
        );
      } catch (e) {
        joins = [];
      }
      return {
        table: tableName,
        joinCount: joins.length,
        joins: joins.map(function(join) {
          return {
            id: join.id,
            label: join.id,
            joinType: 'foreignKey',
            cardinality: null,
            targetTable: join.targettable || join.targetTable,
            joinCondition: join.joincondition || join.joinCondition
          };
        })
      };
    },
    suiteql_execute_query: function(args) {
      if (/\\bLIMIT\\b/i.test(String(args.sql || ''))) {
        throw new Error('LIMIT is not valid SuiteQL syntax. Use ROWNUM in a WHERE clause instead.');
      }
      return runSuiteQL(String(args.sql || ''));
    },
    suiteql_discover_field_values: function(args) {
      return runSuiteQL('SELECT DISTINCT ' + args.fieldId + ' FROM ' + args.tableName + ' WHERE ' + args.fieldId + ' IS NOT NULL AND ROWNUM <= 20');
    },
    netsuite_load_record: function(args) {
      return serializeRecord(record.load({ type: String(args.recordType || args.type), id: String(args.recordId || args.id), isDynamic: false }));
    },
    netsuite_get_record_sublists: getRecordSublists,
    netsuite_get_record_fields: function(args) {
      var blank = record.create({ type: String(args.recordType || args.type), isDynamic: false });
      return { recordType: args.recordType || args.type, fields: blank.getFields(), sublists: blank.getSublists() };
    },
    netsuite_list_record_types: function() {
      var standard = [
        'account', 'assemblyitem', 'bin', 'cashsale', 'contact', 'customer', 'customerdeposit',
        'customerpayment', 'employee', 'estimate', 'expensecategory', 'invoice', 'item',
        'itemfulfillment', 'itemreceipt', 'journalentry', 'lead', 'noninventoryitem',
        'opportunity', 'purchaseorder', 'salesorder', 'script', 'scriptdeployment',
        'serviceitem', 'subsidiary', 'supportcase', 'task', 'vendor', 'vendorbill'
      ].map(function(id) { return { id: id, name: id }; });
      var custom = [];
      try {
        custom = runSuiteQL("SELECT id, scriptid, recordname FROM customrecordtype WHERE isinactive = 'F' ORDER BY recordname")
          .map(function(row) { return { id: String(row.scriptid || '').toLowerCase(), name: row.recordname, internalId: row.id }; });
      } catch (e) {
        custom = [];
      }
      var recordTypes = standard.concat(custom);
      return { count: recordTypes.length, recordTypes: recordTypes };
    },
    netsuite_lists: function(args) {
      var where = ["ROWNUM <= 500"];
      if (args.includeInactive !== true) where.push("isinactive = 'F'");
      if (args.query) {
        var q = escapeSqlLike(args.query);
        where.push("(LOWER(name) LIKE LOWER('%" + q + "%') OR LOWER(scriptid) LIKE LOWER('%" + q + "%') OR TO_CHAR(id) = '" + q + "')");
      }
      var lists = runSuiteQL('SELECT id, name, scriptid, isinactive FROM customlist WHERE ' + where.join(' AND ') + ' ORDER BY name');
      return { count: lists.length, lists: lists };
    },
    netsuite_list_items: function(args) {
      var loaded = record.load({ type: 'customlist', id: String(args.listId), isDynamic: false });
      var count = loaded.getLineCount({ sublistId: 'customvalue' });
      var values = [];
      for (var i = 0; i < count; i += 1) {
        var inactive = false;
        try { inactive = loaded.getSublistValue({ sublistId: 'customvalue', fieldId: 'isinactive', line: i }) === true; } catch (e) {}
        if (inactive && args.includeInactive !== true) continue;
        values.push({
          line: i,
          internalId: loaded.getSublistValue({ sublistId: 'customvalue', fieldId: 'valueid', line: i }),
          value: loaded.getSublistValue({ sublistId: 'customvalue', fieldId: 'value', line: i }),
          abbreviation: loaded.getSublistValue({ sublistId: 'customvalue', fieldId: 'abbreviation', line: i }),
          isInactive: inactive
        });
      }
      return { listId: args.listId, count: values.length, values: values };
    },
    netsuite_create_list: function(args) {
      var list = record.create({ type: 'customlist', isDynamic: true });
      setIfPresent(list, 'name', String(args.name || ''));
      setIfPresent(list, 'scriptid', normalizeScriptSuffix(args.scriptId || args.scriptid, 'customlist'));
      setIfPresent(list, 'description', args.description);
      if (args.isOrdered !== undefined) list.setValue({ fieldId: 'isordered', value: args.isOrdered === true });
      if (args.isHierarchical !== undefined) list.setValue({ fieldId: 'ishierarchical', value: args.isHierarchical === true });
      applyValues(list, args.listFields || {});
      (args.values || []).forEach(function(valueSpec) {
        var item = typeof valueSpec === 'string' ? { value: valueSpec } : valueSpec;
        list.selectNewLine({ sublistId: 'customvalue' });
        list.setCurrentSublistValue({ sublistId: 'customvalue', fieldId: 'value', value: String(item.value || '') });
        if (item.abbreviation) list.setCurrentSublistValue({ sublistId: 'customvalue', fieldId: 'abbreviation', value: item.abbreviation });
        if (item.isInactive !== undefined) list.setCurrentSublistValue({ sublistId: 'customvalue', fieldId: 'isinactive', value: item.isInactive === true });
        list.commitLine({ sublistId: 'customvalue' });
      });
      return { listId: list.save(), name: args.name };
    },
    netsuite_update_list: function(args) {
      var listId = String(args.listId || args.id || '');
      var list = record.load({ type: 'customlist', id: listId, isDynamic: true });
      setIfPresent(list, 'name', args.name);
      if (args.scriptId) setIfPresent(list, 'scriptid', normalizeScriptSuffix(args.scriptId, 'customlist'));
      setIfPresent(list, 'description', args.description);
      if (args.isOrdered !== undefined) list.setValue({ fieldId: 'isordered', value: args.isOrdered === true });
      if (args.isHierarchical !== undefined) list.setValue({ fieldId: 'ishierarchical', value: args.isHierarchical === true });
      applyValues(list, args.listFields || {});
      (args.valuesToAdd || []).forEach(function(item) {
        list.selectNewLine({ sublistId: 'customvalue' });
        list.setCurrentSublistValue({ sublistId: 'customvalue', fieldId: 'value', value: String(item.value || '') });
        if (item.abbreviation) list.setCurrentSublistValue({ sublistId: 'customvalue', fieldId: 'abbreviation', value: item.abbreviation });
        if (item.isInactive !== undefined) list.setCurrentSublistValue({ sublistId: 'customvalue', fieldId: 'isinactive', value: item.isInactive === true });
        list.commitLine({ sublistId: 'customvalue' });
      });
      return { listId: list.save(), updated: true };
    },
    netsuite_create_record: function(args) {
      var created = record.create({ type: String(args.recordType || args.type), isDynamic: true });
      Object.keys(args.values || {}).forEach(function(fieldId) {
        created.setValue({ fieldId: fieldId, value: args.values[fieldId] });
      });
      return { recordType: args.recordType || args.type, id: created.save() };
    },
    netsuite_update_record_fields: function(args) {
      record.submitFields({
        type: String(args.recordType || args.type),
        id: String(args.recordId || args.id),
        values: args.values || {},
        options: { enableSourcing: false, ignoreMandatoryFields: true }
      });
      return { recordType: args.recordType || args.type, recordId: args.recordId || args.id, updated: true };
    },
    netsuite_find_file: function(args) {
      var fileWhere = [];
      if (args.id) fileWhere.push('id = ' + parseId(args.id, 'id'));
      if (args.name) fileWhere.push("LOWER(name) LIKE LOWER('%" + String(args.name).replace(/'/g, "''") + "%')");
      if (!fileWhere.length) throw new Error('At least one of id or name is required.');
      var files = runSuiteQL('SELECT id, name, folder, filesize, filetype, url FROM file WHERE ' + (fileWhere.length === 1 ? fileWhere[0] : '(' + fileWhere.join(' OR ') + ')') + ' AND ROWNUM <= 25');
      return { count: files.length, files: files };
    },
    netsuite_find_folder: function(args) {
      var folderWhere = [];
      if (args.id) folderWhere.push('id = ' + parseId(args.id, 'id'));
      if (args.name) folderWhere.push("LOWER(name) LIKE LOWER('%" + String(args.name).replace(/'/g, "''") + "%')");
      if (!folderWhere.length) throw new Error('At least one of id or name is required.');
      var folders = runSuiteQL('SELECT id, name, parent FROM MediaItemFolder WHERE ' + (folderWhere.length === 1 ? folderWhere[0] : '(' + folderWhere.join(' OR ') + ')') + ' AND ROWNUM <= 25');
      return { count: folders.length, folders: folders };
    },
    netsuite_list_folder: function(args) {
      var folderId = parseId(args.folderId, 'folderId');
      var childFolders = runSuiteQL('SELECT id, name FROM MediaItemFolder WHERE parent = ' + folderId + ' AND ROWNUM <= 200');
      var childFiles = runSuiteQL('SELECT id, name, filesize, filetype, url FROM file WHERE folder = ' + folderId + ' AND ROWNUM <= 200');
      return { folderId: folderId, subfolderCount: childFolders.length, fileCount: childFiles.length, subfolders: childFolders, files: childFiles };
    },
    netsuite_read_file: function(args) {
      var readId = parseId(args.fileId, 'fileId');
      var loadedFile = file.load({ id: readId });
      return { fileId: readId, fileName: loadedFile.name, filetype: loadedFile.fileType, folder: loadedFile.folder, filesize: loadedFile.size, url: loadedFile.url, content: loadedFile.getContents() };
    },
    netsuite_create_folder: function(args) {
      var folderRec = record.create({ type: record.Type.FOLDER, isDynamic: true });
      folderRec.setValue({ fieldId: 'name', value: String(args.name || '') });
      folderRec.setValue({ fieldId: 'parent', value: args.parentFolderId == null ? -15 : parseId(args.parentFolderId, 'parentFolderId') });
      return { folderId: folderRec.save(), name: args.name };
    },
    netsuite_upload_file: function(args) {
      var uploadName = String(args.fileName || '');
      var uploadContents = args.fileContent != null ? args.fileContent : args.fileContentBase64;
      if (!uploadName) throw new Error('fileName is required.');
      if (uploadContents == null) throw new Error('fileContent or fileContentBase64 is required.');
      var upload = file.create({
        name: uploadName,
        fileType: fileTypeFromName(uploadName, args.mediaType),
        contents: uploadContents,
        folder: args.folderId == null ? -15 : parseId(args.folderId, 'folderId'),
        isOnline: args.isOnline === true
      });
      return { fileId: upload.save(), fileName: uploadName };
    },
    netsuite_update_file_content: function(args) {
      return saveFileReplacement(args, false);
    },
    netsuite_rename_file: function(args) {
      return saveFileReplacement(args, true);
    },
    netsuite_delete_file: function(args) {
      var deleteFileId = parseId(args.fileId, 'fileId');
      return { fileId: deleteFileId, deletedId: file.delete({ id: deleteFileId }) };
    },
    netsuite_rename_folder: function(args) {
      record.submitFields({ type: record.Type.FOLDER, id: parseId(args.folderId, 'folderId'), values: { name: String(args.newName || '') } });
      return { folderId: args.folderId, name: args.newName };
    },
    netsuite_delete_folder: function(args) {
      var deleteFolderId = parseId(args.folderId, 'folderId');
      return { folderId: deleteFolderId, deletedId: record.delete({ type: record.Type.FOLDER, id: deleteFolderId }) };
    },
    netsuite_move_items: function(args) {
      var dstFolderId = parseId(args.dstFolderId, 'dstFolderId');
      (args.fileIds || []).forEach(function(id) {
        var sourceFile = file.load({ id: parseId(id, 'fileId') });
        var movedFile = file.create({ name: sourceFile.name, fileType: sourceFile.fileType, contents: sourceFile.getContents(), folder: dstFolderId, isOnline: sourceFile.isOnline });
        movedFile.id = sourceFile.id;
        movedFile.save();
      });
      (args.folderIds || []).forEach(function(id) {
        record.submitFields({ type: record.Type.FOLDER, id: parseId(id, 'folderId'), values: { parent: dstFolderId } });
      });
      return { moved: true, dstFolderId: dstFolderId };
    },
    netsuite_get_scripts: function(args) {
      var scriptWhere = ['ROWNUM <= 500'];
      if (args.scriptId) scriptWhere.push("LOWER(scriptid) = LOWER('" + String(args.scriptId).replace(/'/g, "''") + "')");
      if (args.scriptType) scriptWhere.push("LOWER(scripttype) = LOWER('" + String(args.scriptType).replace(/'/g, "''") + "')");
      if (args.name) scriptWhere.push("LOWER(name) LIKE LOWER('%" + String(args.name).replace(/'/g, "''") + "%')");
      return runSuiteQL('SELECT id, scriptid, name, scripttype, owner, scriptfile FROM script WHERE ' + scriptWhere.join(' AND ') + ' ORDER BY name');
    },
    netsuite_get_script_files: function(args) {
      if (!Array.isArray(args.scriptIds)) throw new Error('scriptIds is required.');
      return args.scriptIds.map(function(scriptId) {
        var scriptRec = record.load({ type: 'script', id: parseId(scriptId, 'scriptId') });
        var scriptFileId = scriptRec.getValue({ fieldId: 'scriptfile' });
        var scriptFile = file.load({ id: scriptFileId });
        return { scriptId: scriptId, scriptRecord: serializeRecord(scriptRec), fileId: scriptFileId, fileName: scriptFile.name, content: scriptFile.getContents() };
      });
    },
    netsuite_get_logs: function(args) {
      var logWhere = ['ROWNUM <= 500'];
      if (Array.isArray(args.scriptIds) && args.scriptIds.length) logWhere.push('script IN (' + args.scriptIds.map(function(id) { return parseId(id, 'scriptId'); }).join(',') + ')');
      if (args.type) logWhere.push("LOWER(type) = LOWER('" + String(args.type).replace(/'/g, "''") + "')");
      return runSuiteQL('SELECT date, time, type, title, detail, script, deployment, scripttype, owner FROM scriptnote WHERE ' + logWhere.join(' AND ') + ' ORDER BY date DESC, time DESC');
    },
    netsuite_get_deployed_scripts: function(args) {
      var recordType = String(args.recordType || '');
      var deployments = runSuiteQL(
        "SELECT sd.primarykey AS deploymentRecordId, sd.script AS scriptId, sd.scriptid AS deploymentScriptId, sd.title, s.name, s.scriptid, s.scripttype, s.scriptfile FROM scriptdeployment sd JOIN script s ON s.id = sd.script WHERE LOWER(sd.recordtype) = LOWER(?) OR ? = '' ORDER BY s.name",
        [recordType, recordType]
      );
      return deployments.map(function(row) {
        var content = null;
        try { content = file.load({ id: row.scriptfile }).getContents(); } catch (e) {}
        row.scriptFileContent = content;
        return row;
      });
    },
    // Custom record type/field creation and update entries were removed:
    // custom records (with all fields) are now created and updated through
    // the SDF deploy companion (netsuite_sdf_deploy / netsuite_sdf_import_object).
    netsuite_inspect_custom_record_field: function(args) {
      var fieldId = args.customFieldId || args.customRecordFieldId || args.fieldId;
      if (!fieldId && args.customRecordTypeId) {
        var suffix = args.scriptId ? normalizeScriptSuffix(args.scriptId, 'custrecord') : '';
        var where = ['rectype = ' + parseId(args.customRecordTypeId, 'customRecordTypeId')];
        if (suffix) where.push("LOWER(scriptid) = LOWER('" + escapeSqlLike(suffix) + "')");
        var matches = runSuiteQL('SELECT id FROM customrecordcustomfield WHERE ' + where.join(' AND ') + ' AND ROWNUM <= 1');
        fieldId = matches[0] && matches[0].id;
      }
      if (!fieldId) throw new Error('customFieldId or customRecordTypeId is required.');
      return serializeRecord(record.load({ type: 'customrecordcustomfield', id: fieldId, isDynamic: false }));
    },
    netsuite_create_script_field: function(args) {
      var values = args.fieldValues || {};
      values.label = values.label || args.label;
      values.scriptid = values.scriptid || normalizeScriptSuffix(args.scriptId, 'custscript');
      values.fieldtype = values.fieldtype || args.fieldType || 'TEXT';
      values.scripttype = values.scripttype || parseId(args.scriptInternalId || args.scriptRecordId, 'scriptInternalId');
      values.description = values.description || args.description;
      if (args.selectRecordType !== undefined) values.selectrecordtype = args.selectRecordType;
      if (args.storeValue !== undefined) values.storevalue = args.storeValue === true;
      return tryCreateRecord(['scriptcustomfield', 'scriptcustfield'], values);
    },
    netsuite_update_script_field: function(args) {
      var id = parseId(args.scriptFieldId || args.fieldId || args.id, 'scriptFieldId');
      var loaded = tryLoadRecord(['scriptcustomfield', 'scriptcustfield'], id);
      var values = args.fieldValues || {};
      if (args.label !== undefined) values.label = args.label;
      if (args.fieldType !== undefined) values.fieldtype = args.fieldType;
      if (args.selectRecordType !== undefined) values.selectrecordtype = args.selectRecordType;
      if (args.description !== undefined) values.description = args.description;
      if (args.storeValue !== undefined) values.storevalue = args.storeValue === true;
      applyValues(loaded.rec, values);
      return { scriptFieldId: loaded.rec.save(), recordType: loaded.recordType, updated: true };
    },
    // netsuite_create_script_record removed: script/deployment creation now
    // goes through the SDF deploy companion (netsuite_sdf_deploy). record.create
    // on the 'script' type is blocked by NetSuite anyway.
    netsuite_update_metadata_record: function(args) {
      var typeMap = {
        customrecordtype: { load: ['customrecordtype'], table: 'customrecordtype', idCol: 'internalid' },
        customrecord: { load: ['customrecordtype'], table: 'customrecordtype', idCol: 'internalid' },
        customrecordfield: { load: ['customrecordcustomfield'], table: 'customfield', idCol: 'internalid' },
        customrecordcustomfield: { load: ['customrecordcustomfield'], table: 'customfield', idCol: 'internalid' },
        field: { load: ['customrecordcustomfield'], table: 'customfield', idCol: 'internalid' },
        scriptparameter: { load: ['scriptcustomfield', 'scriptcustfield'], table: 'customfield', idCol: 'internalid' },
        scriptcustomfield: { load: ['scriptcustomfield', 'scriptcustfield'], table: 'customfield', idCol: 'internalid' },
        scriptparam: { load: ['scriptcustomfield', 'scriptcustfield'], table: 'customfield', idCol: 'internalid' },
        script: { load: ['script'], table: 'script', idCol: 'id' }
      };
      var key = String(args.metadataType || args.type || '').trim().toLowerCase();
      var cfg = typeMap[key];
      if (!cfg) throw new Error('metadataType must be one of: customrecordtype, customrecordcustomfield, scriptcustomfield, script. Got: ' + key);

      var values = args.values || {};
      if (!Object.keys(values).length) throw new Error('values is required (map of field id to value).');

      var id = (args.id != null && String(args.id).trim() !== '') ? parseId(args.id, 'id') : null;
      if (id == null) {
        var scriptId = String(args.scriptId || '').trim();
        if (!scriptId) throw new Error('Provide id (numeric internal id) or scriptId.');
        var rows = runSuiteQL(
          'SELECT ' + cfg.idCol + ' AS internalid FROM ' + cfg.table +
          " WHERE UPPER(scriptid) = UPPER('" + escapeSqlLike(scriptId) + "') AND ROWNUM <= 1"
        );
        if (!rows.length) throw new Error('No ' + key + ' found with scriptid ' + scriptId);
        id = parseId(rows[0].internalid, 'internalid');
      }

      var loaded = null, lastErr = null;
      for (var i = 0; i < cfg.load.length; i += 1) {
        try { loaded = { rec: record.load({ type: cfg.load[i], id: id, isDynamic: false }), recordType: cfg.load[i] }; break; }
        catch (e) { lastErr = e; }
      }
      if (!loaded) throw lastErr || new Error('Unable to load metadata record id ' + id);

      var changed = Object.keys(values);
      var before = {};
      changed.forEach(function(f) { try { before[f] = loaded.rec.getValue({ fieldId: f }); } catch (_) { before[f] = null; } });
      applyValues(loaded.rec, values);
      var savedId = loaded.rec.save({ enableSourcing: false, ignoreMandatoryFields: true });
      var after = {};
      changed.forEach(function(f) { try { after[f] = loaded.rec.getValue({ fieldId: f }); } catch (_) { after[f] = null; } });
      return { metadataType: key, recordType: loaded.recordType, id: savedId, before: before, after: after, updated: true };
    },
    netsuite_run_quick_script: function(args) {
      var code = String(args.code || '').trim();
      if (!code) throw new Error('code is required.');
      return executeQuickScript(code);
    },
    netsuite_submit_task: function(args) {
      var taskType = String(args.taskType || args.type || '');
      var submittedTask = task.create({ taskType: task.TaskType[taskType] || taskType });
      Object.keys(args.values || {}).forEach(function(key) { submittedTask[key] = args.values[key]; });
      return { taskId: submittedTask.submit(), taskType: taskType };
    },
    netsuite_check_task_status: function(args) {
      return task.checkStatus({ taskId: String(args.taskId || '') });
    },
    netsuite_server_info: function() {
      return { accountId: runtime.accountId, user: runtime.getCurrentUser(), script: runtime.getCurrentScript() };
    }
  };

  var callTool = function(name, args) {
    args = args || {};
    try {
      var handler = handlers[name];
      if (!handler) {
        return { ok: false, unsupported: true, error: 'Unsupported server-side MCP tool: ' + name };
      }

      return { ok: true, result: textResult(handler(args)) };
    } catch (e) {
      return {
        ok: false,
        error: {
          name: e && e.name ? e.name : 'ERROR',
          message: e && e.message ? e.message : String(e),
          stack: e && e.stack ? String(e.stack) : undefined
        }
      };
    }
  };

  return { callTool: callTool };
});`;
}

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
    'N/https', 'N/http', 'N/encode', 'N/error', 'N/xml', 'N/crypto',
    'N/currency', 'N/transaction', 'N/redirect',
    './magic_netsuite_mcp_server'
  ],
  (record, search, query, log, file, url, runtime,
   format, email, render, task, workflow,
   https, http, encode, nsError, xml, crypto,
   currency, transaction, redirect, mcpServerModule) => {

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
        'https', 'http', 'encode', 'error', 'xml', 'crypto',
        'currency', 'transaction', 'redirect',
        'context', 'console',
        code
      );
      __result = userFn(
        N.record, N.search, N.query, N.log, N.file, N.url, N.runtime,
        N.format, N.email, N.render, N.task, N.workflow,
        N.https, N.http, N.encode, N.nsError, N.xml, N.crypto,
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

      if (action === 'mcpToolCall') {
        context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
        try {
          var mcpArgs = {};
          if (context.request.parameters.arguments) {
            mcpArgs = JSON.parse(context.request.parameters.arguments);
          }
          context.response.write(JSON.stringify(mcpServerModule.callTool(context.request.parameters.name, mcpArgs)));
        } catch (mcpError) {
          context.response.write(JSON.stringify({
            ok: false,
            error: {
              name: mcpError.name || 'ERROR',
              message: mcpError.message || String(mcpError)
            }
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
        https: https, http: http, encode: encode, nsError: nsError, xml: xml, crypto: crypto,
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
