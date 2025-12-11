const sql = `
SELECT
    script.scriptfile,
    script.name,
    script.scripttype,
    script.id as scriptid,
    scriptdeployment.primarykey,
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
  params: ["CUSTOMER"],
};

const resultSet = await query.runSuiteQL.promise(queryConfig);
const results = resultSet.asMappedResults();

console.log(`Found ${results.length} deployed customer scripts.`);

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
      scriptFile: body,
    };
  } catch (err) {
    console.error(`Error fetching ${result.name}:`, err);
    return {
      scriptName: result.name,
      scriptType: result.scripttype,
      scriptFile: null,
      error: err.message,
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
