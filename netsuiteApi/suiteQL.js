// ============================================================================
// SuiteQL Table Metadata API
// ============================================================================

const SUITELET_DISCOVERY_QUERY = `
SELECT s.id, s.name, s.description, d.isdeployed, d.status, d.id AS deploy_id
FROM suitelet s
JOIN scriptDeployment d ON s.id = d.script
WHERE 
  (LOWER(s.name) LIKE '%suiteql query tool%'
   OR LOWER(s.description) LIKE '%suiteql query tool%'
   OR LOWER(s.name) LIKE '%suiteql%'
   OR LOWER(s.description) LIKE '%suiteql%')
  AND d.isdeployed = 'T'
  AND d.status = 'RELEASED'
`;

const getCompId = () => {
  try {
    const match = window.location.hostname.match(/(\d{7,})/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
};

const buildScriptletUrl = (scriptId, deployId) => {
  const compid = getCompId();
  return `/app/site/hosting/scriptlet.nl?script=${scriptId}&deploy=${deployId}&compid=${compid}`;
};

const discoverSuiteletScript = async (N) => {
  try {
    const { query } = N;
    const result = await query.runSuiteQL.promise({
      query: SUITELET_DISCOVERY_QUERY
    });
    
    const rows = result.asMappedResults();
    if (rows && rows.length > 0) {
      const first = rows[0];
      return {
        scriptId: first.id,
        deployId: first.deploy_id
      };
    }
    return null;
  } catch (err) {
    console.error("[discoverSuiteletScript] Discovery query failed:", err);
    return null;
  }
};

const runSuiteQLViaScriptlet = async (N, sql, limit, returnTotals) => {
  const scriptInfo = await discoverSuiteletScript(N);
  if (!scriptInfo) {
    throw new Error("Failed to discover active SuiteQL suitelet script");
  }
  console.log(`[runSuiteQLViaScriptlet] Using script ${scriptInfo.scriptId}, deploy ${scriptInfo.deployId}`);

  const url = buildScriptletUrl(scriptInfo.scriptId, scriptInfo.deployId);
  const requestPayload = {
    function: "queryExecute",
    query: sql,
    rowBegin: 0,
    rowEnd: limit ?? 1000,
    paginationEnabled: true,
    viewsEnabled: false,
    returnTotals
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestPayload),
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  const results = data.results ?? [];
  return {
    results,
    totalCount: data.totalCount ?? results.length
  };
};

/**
 * Fetch all record types (tables) available for SuiteQL
 * Uses the NetSuite Record Catalog endpoint
 */
window.fetchSuiteQLTables = async () => {
  const url = '/app/recordscatalog/rcendpoint.nl?action=getRecordTypes&data=' +
    encodeURI(JSON.stringify({
      structureType: 'FLAT'
    }));

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const data = await response.json();
  console.log('Record Types Result:', data);
  return data;
};

/**
 * Fetch record type detail (fields, joins) for a specific table
 * @param {string} tableName - The script ID / table name (e.g. 'customer')
 */
window.fetchSuiteQLTableDetail = async (tableName) => {
  const url = '/app/recordscatalog/rcendpoint.nl?action=getRecordTypeDetail&data=' +
    encodeURI(JSON.stringify({
      scriptId: tableName,
      detailType: 'SS_ANAL'
    }));

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const data = await response.json();
  console.log('Table Detail Result:', data);
  return data;
};

/**
 * Run a SuiteQL query using the paged N/query API
 * @param {object} N - NetSuite modules
 * @param {string} sql - The SuiteQL query string
 * @param {number|null} limit - Max rows to return (null = all)
 * @returns {{ results: object[], totalCount: number }}
 */
window.runSuiteQLQuery = async (N, sql, limit) => {
  const { query } = N;
  const effectiveLimit = (limit === null || limit === undefined) ? Infinity : limit;

  try {
    const pagedData = await query.runSuiteQLPaged.promise({ query: sql, pageSize: 1000 });
    const totalCount = pagedData.count;

    const results = [];

    for (const pageRange of pagedData.pageRanges) {
      if (results.length >= effectiveLimit) break;
      const page = await pagedData.fetch.promise({ index: pageRange.index });
      const rows = page.data.asMappedResults();
      results.push(...rows);
    }

    return { results: results.slice(0, effectiveLimit === Infinity ? undefined : effectiveLimit), totalCount };
  } catch (primaryErr) {
    console.warn("[runSuiteQLQuery] N/query API failed, trying suitelet fallback:", primaryErr);
    const returnTotals = effectiveLimit !== Infinity;
    return runSuiteQLViaScriptlet(N, sql, limit ?? 1000, returnTotals);
  }
};

/**
 * Get the total row count for a SuiteQL query without fetching all data
 * @param {object} N - NetSuite modules
 * @param {string} sql - The SuiteQL query string
 * @returns {number}
 */
window.getSuiteQLCount = async (N, sql) => {
  try {
    const { query } = N;
    const pagedData = await query.runSuiteQLPaged.promise({ query: sql, pageSize: 5 });
    return pagedData.count;
  } catch (primaryErr) {
    console.warn("[getSuiteQLCount] N/query API failed, trying suitelet fallback:", primaryErr);
    const result = await runSuiteQLViaScriptlet(N, sql, 5, true);
    return result.totalCount;
  }
};
