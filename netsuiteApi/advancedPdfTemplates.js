window.getAdvancedPDFTemplates = async (N) => {
  const { query } = N;
  const sql = `
SELECT
    CustomRecordType.name as customRecordType,
    CustomTransactionType.name as customTransactionType,
    AdvancedPdfTemplate.id,
    AdvancedPdfTemplate.inactive,
    AdvancedPdfTemplate.name,
    AdvancedPdfTemplate.preferred,
    AdvancedPdfTemplate.printType,
    AdvancedPdfTemplate.savedSearch,
    AdvancedPdfTemplate.scriptId,
    AdvancedPdfTemplate.tranType
FROM AdvancedPdfTemplate
LEFT JOIN CustomRecordType
    ON AdvancedPdfTemplate.customrecordtype = CustomRecordType.internalid
LEFT JOIN CustomTransactionType
    ON AdvancedPdfTemplate.customtransactiontype = CustomTransactionType.id
`;

  const queryConfig = { query: sql };
  const resultSet = await query.runSuiteQL.promise(queryConfig);

  const results = resultSet.asMappedResults();

  console.log("Advanced PDF Templates: ", results.length);

  return results;
};

window.getAdvancedPDFTemplate = async (N, { id }) => {};
