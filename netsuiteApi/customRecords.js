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

  console.log("Custom Records: ", results.length);

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

window.getAllRecordTypes = ({ record, query }) => {
  const recordTypes = record.Type;
  const standardRecords = Object.entries(recordTypes).map(([key, value]) => {
    const keys = key.toLowerCase().split("_");
    const formattedKey = keys
      .map(
        ([keyToCapitalize, ...rest]) =>
          keyToCapitalize.toUpperCase() + rest.join("")
      )
      .join(" ");

    const formattedValue = value.toLowerCase();

    return {
      name: formattedKey,
      id: formattedValue
    };
  });

  const customRecords = query
    .runSuiteQL({
      query: `SELECT
	CustomRecordType.name,
	CustomRecordType.scriptId as id,
	FROM
	CustomRecordType
`
    })
    .asMappedResults();

  const records = [...customRecords, ...standardRecords];

  return records;
};
