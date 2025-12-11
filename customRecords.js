window.getCustomRecords = async (N) => {
  const { query } = N;
  const sql = `
SELECT
    Name,
    ScriptID,
    InternalID,
    Description,
    BUILTIN.DF( Owner ) AS Owner,
FROM
    CustomRecordType
`;

  const queryConfig = { query: sql };
  const resultSet = await query.runSuiteQL.promise(queryConfig);

  const results = resultSet.asMappedResults();

  console.log(results);

  return results;
};

window.getCustomRecordUrl = (N, { recordId }) => {
  const { url } = N;
  const customRecordUrl =
    "https://" +
    url.resolveDomain({ hostType: url.HostType.APPLICATION }) +
    "/app/common/custom/custrecord.nl?id=" +
    recordId;
  return customRecordUrl;
};

window.getCurrentRecordIdType = (N) => {
  const { currentRecord } = N;
  const currentRec = currentRecord.get();
  const currentRecordData = { id: currentRec.id, type: currentRec.type };
  console.log("Current Record Data:", currentRecordData);
  return currentRecordData;
};
