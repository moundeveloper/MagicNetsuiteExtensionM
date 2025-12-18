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
  const sql = `SELECT name as label, id FROM scripttype ORDER BY name ASC;`;
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
        script.id as scriptid,
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
      params: [recordType.toUpperCase()],
    };

    const resultSet = await query.runSuiteQL.promise(queryConfig);
    const results = resultSet.asMappedResults();

    console.log(
      `Found ${results.length} deployed ${recordType.toUpperCase()} scripts.`
    );

    const domain = url.resolveDomain({
      hostType: url.HostType.APPLICATION,
    });

    // Build all the fetch promises first
    const fetchPromises = results.map(async (result) => {
      const fileUrl = `https://${domain}${result.url}`;
      try {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${fileUrl}: ${response.statusText}`);
        }
        const body = await response.text();
        console.log(`Fetched ${result.name} (${result.scripttype})`);
        return {
          scriptName: result.name,
          scriptType: result.scripttype,
          scriptId: result.scriptid,
          scriptFile: body,
        };
      } catch (err) {
        console.error(`Error fetching ${result.name}:`, err);
        return {
          scriptName: result.name,
          scriptType: result.scripttype,
          scriptId: result.scriptid,
          scriptFile: null,
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

window.getDeployments = async ({ query, url }, { scriptId }) => {
  console.log("Script ID:", scriptId);

  if (!scriptId) {
    return null;
  }

  try {
    const sql = `
    SELECT
         scriptid, 
         recordtype,
         isdeployed, 
         status, 
         loglevel,
         primarykey
    FROM
        scriptdeployment
    WHERE
        script = ?
    `;

    const queryConfig = {
      query: sql,
      params: [scriptId],
    };

    const resultSet = await query.runSuiteQL.promise(queryConfig);
    const results = resultSet.asMappedResults();

    return results;
    console.log(`Retrieved ${results.length} script deployments`);
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
      returnExternalUrl: false,
    });
  console.log("Suitelet URL:", suiteletUrl);
  return suiteletUrl;
};
