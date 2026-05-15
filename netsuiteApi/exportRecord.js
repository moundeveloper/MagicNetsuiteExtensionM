const exportRecordDetails = (N, config = {}) => {
  const {
    blackListFields = [],
    blackListSublistFields = [],
    blackListSublists = [],
    whiteListFields = null,
    whiteListSublists = null,
    whiteListSublistFields = null,
    include = null
  } = config;

  const { record, currentRecord } = N;

  const currRec = currentRecord.get();
  const recordId = currRec.id;
  const recordType = currRec.type;

  console.log("Exporting record:", {
    recordId,
    recordType,
    config
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
      id: recordId
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

/**
 * Load a record by type + id and return all body field values + all sublist rows.
 * Each field is returned as { value, text } to expose both the stored value and
 * the display text (e.g. for select fields: value = internalId, text = label).
 *
 * @param {object} N - NetSuite modules (must expose N.record)
 * @param {object} options
 * @param {string} options.type - Record type (e.g. 'salesorder', 'customer')
 * @param {string|number} options.id - Internal ID of the record
 * @param {string[]|null} [options.sublistIds] - Whitelist of sublists to include (null = all)
 * @returns {{ id: string, type: string, body: object, sublists: object }}
 */
window.loadRecordById = (N, { type, id, bodyOnly = false }) => {
  const { record } = N;
  const rec = record.load({ type, id });

  // Body fields
  const body = {};
  for (const fieldId of rec.getFields()) {
    try {
      body[fieldId] = {
        value: rec.getValue({ fieldId }),
        text: rec.getText({ fieldId })
      };
    } catch {
      // Skip fields that error (formula fields, etc.)
    }
  }

  if (bodyOnly) {
    return { id: String(rec.id), type: rec.type, body };
  }

  // Sublists (legacy path — kept for backward compat)
  const sublists = {};
  const availableSublists = rec.getSublists();
  for (const sublistId of availableSublists) {
    const lineCount = rec.getLineCount({ sublistId });
    const sublistFieldIds = rec.getSublistFields({ sublistId });
    const rows = [];
    for (let i = 0; i < lineCount; i++) {
      const row = {};
      for (const fieldId of sublistFieldIds) {
        try {
          row[fieldId] = {
            value: rec.getSublistValue({ sublistId, fieldId, line: i }),
            text: rec.getSublistText({ sublistId, fieldId, line: i })
          };
        } catch {
          // Skip fields that error on this line
        }
      }
      rows.push(row);
    }
    sublists[sublistId] = rows;
  }

  return { id: String(rec.id), type: rec.type, body, sublists };
};

/**
 * Load a record's sublist rows only — no body fields.
 * Useful when the body is already known and only line-item data is needed.
 *
 * @param {object} N - NetSuite modules (must expose N.record)
 * @param {object} options
 * @param {string} options.type - Record type (e.g. 'salesorder')
 * @param {string|number} options.id - Internal ID of the record
 * @param {string[]|null} [options.sublistIds] - Whitelist of sublists to include (null = all)
 * @returns {{ id: string, type: string, sublists: object }}
 */
window.loadRecordSublists = (N, { type, id, sublistIds = null }) => {
  const { record } = N;
  const rec = record.load({ type, id });

  const sublists = {};
  const availableSublists = rec.getSublists();
  const targetSublists = sublistIds
    ? availableSublists.filter((s) => sublistIds.includes(s))
    : availableSublists;

  for (const sublistId of targetSublists) {
    const lineCount = rec.getLineCount({ sublistId });
    const sublistFieldIds = rec.getSublistFields({ sublistId });
    const rows = [];
    for (let i = 0; i < lineCount; i++) {
      const row = {};
      for (const fieldId of sublistFieldIds) {
        try {
          row[fieldId] = {
            value: rec.getSublistValue({ sublistId, fieldId, line: i }),
            text: rec.getSublistText({ sublistId, fieldId, line: i })
          };
        } catch {
          // Skip fields that error on this line
        }
      }
      rows.push(row);
    }
    sublists[sublistId] = rows;
  }

  return { id: String(rec.id), type: rec.type, sublists };
};

/**
 * Get available body fields and sublist fields for a record type, without loading
 * a real record. Creates a temporary in-memory record via record.create() and uses
 * getFields() / getSublists() / getSublistFields() to enumerate metadata.
 *
 * @param {object} N - NetSuite modules (must expose N.record)
 * @param {object} options
 * @param {string} options.type - Record type (e.g. 'salesorder', 'customer', 'customrecord_foo')
 * @returns {{ type: string, fields: string[], sublists: Record<string, string[]> }}
 */
window.getRecordFields = (N, { type }) => {
  const { record } = N;
  const tempRec = record.create({ type });

  const fields = tempRec.getFields();
  const sublistIds = tempRec.getSublists();

  const sublists = {};
  for (const sublistId of sublistIds) {
    sublists[sublistId] = tempRec.getSublistFields({ sublistId });
  }

  return { type, fields, sublists };
};
