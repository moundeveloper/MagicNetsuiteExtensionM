window.getScripts = async (N, { scriptId = null } = {}) => {
  console.log("getScripts", scriptId);
  const { query } = N;

  let sql = `
      SELECT
          script.scriptid,
          script.id,
          script.name,
          script.scripttype,
          entity.entityid as owner,
		      file.name as scriptfile
      FROM
          script
          INNER JOIN entity on script.owner = entity.id
		      INNER JOIN file on file.id = script.scriptfile
    `;

  // Only add WHERE if scriptId is provided
  if (scriptId) {
    sql += ` WHERE script.scriptid = ?`;
  }

  const queryConfig = { query: sql };

  if (scriptId) {
    queryConfig.params = [scriptId];
  }

  const resultSet = await query.runSuiteQL.promise(queryConfig);

  const results = resultSet.asMappedResults();

  console.log(`Retrieved ${results.length} script records`);

  return results;
};

window.getScriptTypes = async (N) => {
  const { query } = N;
  const sql = `SELECT name as label, id FROM scripttype ORDER BY name ASC`;
  const queryConfig = { query: sql };
  const resultSet = await query.runSuiteQL.promise(queryConfig);
  const results = resultSet.asMappedResults();
  return results;
};

window.getScriptUrl = (N, { scriptId }) => {
  console.log("Script ID:", scriptId);

  if (!scriptId) {
    return null;
  }

  const { url } = N;

  const scriptUrl =
    "https://" +
    url.resolveDomain({ hostType: url.HostType.APPLICATION }) +
    "/app/common/scripting/script.nl?id=" +
    scriptId;
  return scriptUrl;
};

window.getScriptFiles = async ({ query, url }, { scriptIds }) => {
  console.log("getScriptFiles - Script IDs:", scriptIds);

  if (!scriptIds || !Array.isArray(scriptIds) || scriptIds.length === 0) {
    return [];
  }

  try {
    const placeholders = scriptIds.map(() => "?").join(", ");

    const sql = `
    SELECT
        script.scriptfile,
        script.name,
        script.scripttype,
        script.id,
        script.scriptid,
        file.url
    FROM
        script
        INNER JOIN file ON script.scriptfile = file.id
    WHERE
        script.id IN (${placeholders})
    `;

    const queryConfig = {
      query: sql,
      params: scriptIds
    };

    const resultSet = await query.runSuiteQL.promise(queryConfig);
    const results = resultSet.asMappedResults();

    console.log(
      `Found ${results.length} scripts for IDs: ${scriptIds.join(", ")}`
    );

    const domain = url.resolveDomain({
      hostType: url.HostType.APPLICATION
    });

    const fetchPromises = results.map(async (result) => {
      const fileUrl = `https://${domain}${result.url}`;
      try {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch ${result.name}: ${response.statusText}`
          );
        }
        const body = await response.text();
        console.log(`Fetched ${result.name} (${result.scripttype})`);
        return {
          scriptName: result.name,
          scriptType: result.scripttype,
          scriptId: result.scriptid,
          id: result.id,
          scriptFile: body
        };
      } catch (err) {
        console.error(err);
        return {
          scriptName: result.name,
          scriptType: result.scripttype,
          scriptId: result.scriptid,
          id: result.id,
          scriptFile: null
        };
      }
    });

    const fetchedResults = await Promise.all(fetchPromises);

    console.log(
      `Fetched ${
        fetchedResults.filter((f) => f.scriptFile).length
      } script files successfully.`
    );

    return fetchedResults;
  } catch (error) {
    console.error("getScriptFiles error:", error);
    return [];
  }
};

window.getDeployedScriptFiles = async ({ query, url }, { recordType }) => {
  console.log("Record Type:", recordType);
  if (!recordType || typeof recordType !== "string") {
    return;
  }

  try {
    const sql = `
    SELECT
        script.scriptfile,
        script.name,
        script.scripttype,
        script.id,
        script.scriptid,
        file.url
    FROM
        scriptdeployment
        INNER JOIN script ON scriptdeployment.script = script.id
        INNER JOIN file ON script.scriptfile = file.id
    WHERE
        scriptdeployment.recordtype = ?
        AND scriptdeployment.isdeployed = 'T'
    `;

    const queryConfig = {
      query: sql,
      params: [recordType.toUpperCase()]
    };

    const resultSet = await query.runSuiteQL.promise(queryConfig);
    const results = resultSet.asMappedResults();

    console.log(
      `Found ${results.length} deployed ${recordType.toUpperCase()} scripts.`
    );

    const domain = url.resolveDomain({
      hostType: url.HostType.APPLICATION
    });

    // Build all the fetch promises first
    const fetchPromises = results.map(async (result) => {
      const fileUrl = `https://${domain}${result.url}`;
      try {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch ${result.name}: ${response.statusText}`
          );
        }
        const body = await response.text();
        console.log(`Fetched ${result.name} (${result.scripttype})`);
        return {
          scriptName: result.name,
          scriptType: result.scripttype,
          scriptId: result.scriptid,
          id: result.id,
          scriptFile: body
        };
      } catch (err) {
        console.error(err);
        return {
          scriptName: result.name,
          scriptType: result.scripttype,
          scriptId: result.scriptid,
          id: result.id,
          scriptFile: null
        };
      }
    });

    // Wait for all fetches to complete in parallel
    const fetchedResults = await Promise.all(fetchPromises);

    console.log(
      `Fetched ${
        fetchedResults.filter((f) => f.scriptFile).length
      } scripts successfully.`
    );

    return fetchedResults;
  } catch (error) {
    log.error("Error", error);
  }
};

window.getDeployments = async (
  { query, url },
  { scriptId = null, scriptIds = [] }
) => {
  console.log("Script ID:", scriptId);
  console.log("Script IDs:", scriptIds);

  let queryCondition = "";
  let params = [];

  if (scriptId) {
    queryCondition = "WHERE script = ?";
    params = [scriptId];
  } else if (scriptIds && scriptIds.length > 0) {
    // Create placeholders for each ID: (?, ?, ?)
    const placeholders = scriptIds.map(() => "?").join(", ");
    queryCondition = `WHERE script IN (${placeholders})`;
    params = scriptIds;
  }

  console.log("queryCondition:", queryCondition);
  console.log("params:", params);

  if (!queryCondition) {
    return [];
  }

  try {
    const sql = `
    SELECT
         scriptDeployment.scriptid, 
         scriptDeployment.recordtype,
         scriptDeployment.isdeployed, 
         scriptDeployment.status, 
         scriptDeployment.loglevel,
         scriptDeployment.primarykey,
         script.id,
         script.name as scriptname,
    FROM
        scriptdeployment
    INNER JOIN script
    ON 	scriptDeployment.script = script.id
    ${queryCondition}
    `;

    const queryConfig = {
      query: sql,
      params: params
    };

    console.log("queryConfig:", queryConfig);

    const resultSet = await query.runSuiteQL.promise(queryConfig);
    const results = resultSet.asMappedResults();
    console.log(`Retrieved ${results.length} script deployments`);
    return results;
  } catch (error) {
    log.error("Error", error);
  }
};

window.getScriptDeploymentUrl = async (N, { deployment }) => {
  console.log("Deployment ID:", deployment);

  if (!deployment) {
    return null;
  }

  const { url } = N;

  const scriptUrl =
    "https://" +
    url.resolveDomain({ hostType: url.HostType.APPLICATION }) +
    "/app/common/scripting/scriptrecord.nl?id=" +
    deployment;
  return scriptUrl;
};

window.getSuiteletUrl = async (N, { script, deployment }) => {
  const { url } = N;
  const suiteletUrl =
    "https://" +
    url.resolveDomain({ hostType: url.HostType.APPLICATION }) +
    url.resolveScript({
      scriptId: script,
      deploymentId: deployment,
      returnExternalUrl: false
    });
  console.log("Suitelet URL:", suiteletUrl);
  return suiteletUrl;
};

window.saveScriptlet = async ({
  name,
  scriptId,
  scriptFile,
  ownerId,
  ownerName,
  description = "",
  apiVersion = "2.1",
  scriptType = "SCRIPTLET",
  domain,
  csrf
}) => {
  const resolvedDomain =
    domain || window.location.host;
  const formEncode = (str) => encodeURIComponent(str).replace(/%20/g, "+");
  const encodedScriptType = encodeURIComponent(scriptType);
  let body = `submitter=Save&scripttype=__SCRIPTTYPE__&name=__NAME__&package=&scriptid=__SCRIPTID__&nsutils-automated-ids=on&apiversion=__APIVERSION__&description=__DESCRIPTION__&inpt_owner=__OWNERNAME__&owner=__OWNERID__&_eml_nkey_=__NKEY__&_multibtnstate_=&selectedtab=&nsapiPI=&nsapiSR=&nsapiVF=&nsapiFC=&nsapiPS=&nsapiVI=&nsapiVD=&nsapiPD=&nsapiVL=&nsapiRC=&nsapiLI=&nsapiLC=&nsapiCT=__NSAPICT__&nsbrowserenv=istop%3DT&wfPI=&wfSR=&wfVF=&wfFC=&wfPS=&type=script&id=&externalid=&whence=&customwhence=&entryformquerystring=scriptfile%3D__SCRIPTFILE__%26scripttype%3D__ENCODEDSCRIPTTYPE__%26apiversion%3D__APIVERSION__&_csrf=__CSRF__&wfinstances=&customplugintype=&scriptfile=__SCRIPTFILE__&defaultfunction=&defaultfunction_v2=F&notifyuser=F&notifyowner=T&notifyadmins=F&notifygroup=&notifyemails=&submitted=T&formdisplayview=NONE&_button=&customplugintypesfields=plugintype&customplugintypesflags=1&customplugintypesfieldsets=&customplugintypestypes=select&customplugintypesorigtypes=&customplugintypesparents=&customplugintypeslabels=Custom+Plug-In+Type&customplugintypesdata=&nextcustomplugintypesidx=1&customplugintypesvalid=T&parametersfields=label%01internalid%01fieldtype%01selectrecordtype%01setting%01accesslevel%01searchlevel&parametersflags=1%010%010%010%010%010%010&parametersfieldsets=%01%01%01%01%01%01&parameterstypes=text%01identifier%01select%01select%01select%01text%01text&parametersorigtypes=%01%01%01%01%01%01&parametersparents=%01%01%01%01%01%01&parameterslabels=Label%01ID%01Type%01List%2FRecord%01Preference%01%01&parametersdata=&nextparametersidx=1&parametersvalid=T&parametersloaded=F&deploymentsfields=id%01seqnum%01oldrecordtype%01scripttype%01title%01scriptid%01primarykey%01deploymentid%01version%01isdeployed%01status%01eventtype%01loglevel&deploymentsflags=0%010%010%010%011%010%010%010%010%010%011%010%010&deploymentsfieldsets=%01%01%01%01%01%01%01%01%01%01%01%01&deploymentstypes=text%01text%01text%01text%01text%01identifier%01text%01text%01text%01checkbox%01select%01select%01select&deploymentsorigtypes=%01%01%01%01%01%01%01%01%01%01%01%01&deploymentsparents=%01%01%01%01%01%01%01%01%01%01%01%01&deploymentslabels=%01%01%01%01Title%01ID%01%01%01%01Deployed%01Status%01Event+Type%01Log+Level&deploymentsdata=&nextdeploymentsidx=1&deploymentsvalid=T&deploymentsloaded=F`;

  body = body
    .replace(/__NAME__/g, formEncode(name))
    .replace(/__SCRIPTID__/g, formEncode(scriptId))
    .replace(/__SCRIPTFILE__/g, formEncode(scriptFile))
    .replace(/__OWNERID__/g, formEncode(ownerId))
    .replace(/__OWNERNAME__/g, formEncode(ownerName))
    .replace(/__DESCRIPTION__/g, formEncode(description))
    .replace(/__APIVERSION__/g, formEncode(apiVersion))
    .replace(/__SCRIPTTYPE__/g, formEncode(scriptType))
    .replace(/__ENCODEDSCRIPTTYPE__/g, encodedScriptType)
    .replace(/__CSRF__/g, csrf)
    .replace(/__NSAPICT__/g, Date.now().toString());

  return fetch(
    `https://${resolvedDomain}/app/common/scripting/script.nl`,
    {
      method: "POST",
      credentials: "include",
      mode: "cors",
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "it-IT,it;q=0.6",
        "cache-control": "max-age=0",
        "content-type": "application/x-www-form-urlencoded",
        priority: "u=0, i",

        // critical headers
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",

        "upgrade-insecure-requests": "1"
      },
      referrer: `https://${resolvedDomain}/app/common/scripting/script.nl?scriptfile=${scriptFile}&scripttype=${scriptType}&apiversion=${apiVersion}&package=&whence=`,
      body
    }
  );
};

/**
 * Extract the internal script record ID from the HTML response after saving a script.
 * Tries multiple strategies (hidden input, URL pattern).
 * @param {string} html
 * @returns {string|null}
 */
function extractScriptIdFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // 1) hidden input named "id" with a numeric value
  const idInput = doc.querySelector('input[name="id"]');
  if (idInput && /^\d+$/.test(idInput.value)) return idInput.value;

  // 2) URL pattern: script.nl?id=<digits>
  const m = html.match(/script\.nl\?id=(\d+)/);
  if (m) return m[1];

  // 3) href containing /app/common/scripting/script.nl?id=
  const link = doc.querySelector('a[href*="scripting/script.nl?id="]');
  if (link) {
    const m2 = link.getAttribute("href").match(/[?&]id=(\d+)/);
    if (m2) return m2[1];
  }

  return null;
}

/**
 * Create a NetSuite Script record for an already-uploaded file.
 *
 * @param {object} N              - NetSuite modules object (must expose url, runtime)
 * @param {object} options
 * @param {string}  options.name        - Human-readable script name
 * @param {string}  options.scriptId    - Script ID (e.g. "customscript_my_suitelet")
 * @param {string|number} options.fileId - Internal ID of the uploaded .js file
 * @param {string}  [options.scriptType] - NetSuite script type constant (default: "SUITELET")
 * @param {string}  [options.description]
 * @param {string}  [options.apiVersion] - default "2.1"
 * @param {string}  csrfToken
 * @returns {Promise<{scriptRecordId: string|null, scriptUrl: string|null}>}
 */
window.createScriptRecord = async (
  N,
  { name, scriptId, fileId, scriptType = "SUITELET", description = "", apiVersion = "2.1" },
  csrfToken
) => {
  const { url, runtime } = N;

  const domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });

  // Get current user info for owner fields
  const currentUser = runtime.getCurrentUser();
  const ownerId = String(currentUser.id);
  const ownerName = currentUser.name || "";

  console.log("[createScriptRecord]", { name, scriptId, fileId, scriptType, ownerId });

  const response = await window.saveScriptlet({
    name,
    scriptId,
    scriptFile: String(fileId),
    ownerId,
    ownerName,
    description,
    apiVersion,
    scriptType,
    domain,
    csrf: csrfToken
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("[createScriptRecord] HTTP error", response.status, text.slice(0, 500));
    throw new Error(`createScriptRecord: HTTP ${response.status}`);
  }

  const html = await response.text();
  const scriptRecordId = extractScriptIdFromHtml(html);

  console.log("[createScriptRecord] scriptRecordId:", scriptRecordId);

  const scriptUrl = scriptRecordId
    ? `https://${domain}/app/common/scripting/script.nl?id=${scriptRecordId}`
    : null;

  return { scriptRecordId, scriptUrl };
};
