window.getScripts = async (N, { scriptId = null } = {}) => {
  console.log("getScripts", scriptId);
  const { query } = N;

  let sql = `
      SELECT
          script.scriptid,
          script.id,
          script.name,
          script.scriptfile,
          script.scripttype,
          entity.entityid as owner
      FROM
          script
          INNER JOIN entity on script.owner = entity.id
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

const fetchFileContent = (fileId) => {
  try {
    // Build the NetSuite media URL dynamically
    const fileLookup = N.search.lookupFields({
      type: "file",
      id: fileId,
      columns: ["url"],
    });

    const domain = N.url.resolveDomain({
      hostType: N.url.HostType.APPLICATION,
    });

    const fileUrl = `https://${domain}${fileLookup.url}`;

    const response = N.https.get({ url: fileUrl });

    return response.body;
  } catch (e) {
    console.error("Error fetching file:", e);
    return null;
  }
};

window.getDeployedScriptFiles = (N, { recordType }) => {
  console.log("Record Type:", recordType);
  if (!recordType || typeof recordType !== "string") {
    return;
  }
  try {
    console.log("Record Type:", recordType);
    const scriptSearch = N.search.create({
      type: "scriptdeployment",
      filters: [
        ["isdeployed", "is", "T"],
        "AND",
        ["recordtype", "anyof", recordType.toUpperCase()],
      ],
      columns: [
        N.search.createColumn({
          name: "name",
          join: "script",
          label: "Name",
        }),
        N.search.createColumn({ name: "scriptid", label: "Custom ID" }),
        N.search.createColumn({ name: "script", label: "Script ID" }),
        N.search.createColumn({ name: "recordtype", label: "Record Type" }),
        N.search.createColumn({ name: "status", label: "Status" }),
        N.search.createColumn({ name: "isdeployed", label: "Is Deployed" }),
        N.search.createColumn({ name: "scripttype", label: "Script Type" }),
        N.search.createColumn({
          name: "scriptfile",
          join: "script",
          label: "Script File",
        }),
      ],
    });

    const searchResultCount = scriptSearch.runPaged().count;

    console.log("Search Result Count:", searchResultCount);

    const resultsList = [];

    const pagedData = scriptSearch.runPaged({ pageSize: 1000 });

    pagedData.pageRanges.forEach(function (pageRange) {
      const page = pagedData.fetch({ index: pageRange.index });
      page.data.forEach(function (result) {
        const script = {
          title: result.getValue({ name: "name", join: "script" }),
          scripttype: result.getText({ name: "scripttype" }),
          scriptfile: result.getValue({ name: "scriptfile", join: "script" }),
        };

        const scriptFile = fetchFileContent(script.scriptfile);

        resultsList.push({
          scriptName: script.title,
          scriptFile,
          scriptType: script.scripttype,
        });
      });
    });

    console.log("Results List:", resultsList);

    return resultsList;
  } catch (error) {
    log.error("Error", error);
  }
};
