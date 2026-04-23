// ============================================================================
// SuiteQL Table Metadata API
// ============================================================================

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
  const pagedData = await query.runSuiteQLPaged.promise({ query: sql, pageSize: 1000 });
  const totalCount = pagedData.count;

  const results = [];
  const effectiveLimit = (limit === null || limit === undefined) ? Infinity : limit;

  for (const pageRange of pagedData.pageRanges) {
    if (results.length >= effectiveLimit) break;
    const page = await pagedData.fetch.promise({ index: pageRange.index });
    const rows = page.data.asMappedResults();
    results.push(...rows);
  }

  return { results: results.slice(0, effectiveLimit === Infinity ? undefined : effectiveLimit), totalCount };
};

/**
 * Get the total row count for a SuiteQL query without fetching all data
 * @param {object} N - NetSuite modules
 * @param {string} sql - The SuiteQL query string
 * @returns {number}
 */
window.getSuiteQLCount = async (N, sql) => {
  const { query } = N;
  const pagedData = await query.runSuiteQLPaged.promise({ query: sql, pageSize: 5 });
  return pagedData.count;
};
