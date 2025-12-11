const exportRecordDetails = (N, config = {}) => {
  const {
    blackListFields = [],
    blackListSublistFields = [],
    blackListSublists = [],
    whiteListFields = null,
    whiteListSublists = null,
    whiteListSublistFields = null,
    include = null,
  } = config;

  const { record, currentRecord } = N;

  const currRec = currentRecord.get();
  const recordId = currRec.id;
  const recordType = currRec.type;

  console.log("Exporting record:", {
    recordId,
    recordType,
    config,
  });

  if (!recordId || !recordType) {
    console.log("No record selected");
    return;
  }

  // Load record
  let rec = null;
  try {
    rec = record.load({
      type: recordType,
      id: recordId,
    });
  } catch (error) {
    console.log("Record not found", error);
    return;
  }

  if (!rec) {
    console.log("Record not found");
    return;
  }

  const exportData = {};

  // Helper function to build field data based on include array
  const buildFieldData = (fieldId, getText, getValue, getField) => {
    if (include === null) {
      return getText();
    }

    const fieldData = {};

    if (include.includes("fieldId")) {
      fieldData.fieldId = fieldId;
    }

    if (include.includes("fieldName")) {
      const field = getField();
      fieldData.fieldName = field ? field.label : null;
    }

    if (include.includes("text")) {
      fieldData.text = getText();
    }

    if (include.includes("value")) {
      fieldData.value = getValue();
    }

    return fieldData;
  };

  // Export body fields
  const fieldIds = rec.getFields();
  exportData.body = {};

  fieldIds.forEach((fid) => {
    // Apply blacklist first
    if (blackListFields.includes(fid)) return;

    // Then apply whitelist if specified
    if (whiteListFields !== null && !whiteListFields.includes(fid)) return;

    exportData.body[fid] = buildFieldData(
      fid,
      () => rec.getText({ fieldId: fid }),
      () => rec.getValue({ fieldId: fid }),
      () => rec.getField({ fieldId: fid })
    );
  });

  // Export sublists and their fields
  const sublistIds = rec.getSublists();
  exportData.sublists = {};

  sublistIds.forEach((sublistId) => {
    // ✅ Apply blacklist for sublists
    if (blackListSublists.includes(sublistId)) return;

    // Apply whitelist for sublists if specified
    if (whiteListSublists !== null && !whiteListSublists.includes(sublistId))
      return;

    const lineCount = rec.getLineCount({ sublistId });
    exportData.sublists[sublistId] = [];

    for (let i = 0; i < lineCount; i++) {
      const lineFields = rec.getSublistFields({ sublistId });
      const lineData = {};

      lineFields.forEach((fieldId) => {
        // ✅ Apply blacklist for sublist fields
        if (blackListSublistFields.includes(fieldId)) return;

        // ✅ Apply whitelist for sublist fields if specified
        if (
          whiteListSublistFields !== null &&
          !whiteListSublistFields.includes(fieldId)
        )
          return;

        lineData[fieldId] = buildFieldData(
          fieldId,
          () => rec.getSublistText({ sublistId, fieldId, line: i }),
          () => rec.getSublistValue({ sublistId, fieldId, line: i }),
          () => rec.getSublistField({ sublistId, fieldId, line: i })
        );
      });

      exportData.sublists[sublistId].push(lineData);
    }
  });

  return exportData;
};

window.exportRecord = async (N, config = {}) => {
  const exportedRecord = exportRecordDetails(N, config);
  return exportedRecord;
};
