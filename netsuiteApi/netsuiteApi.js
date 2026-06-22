console.log("netsuiteApi");

const NETSUITE_REQUIRE_TIMEOUT_MS = 5000;
const NETSUITE_RUNTIME_SCRIPTS = [
  "/assets/suitescript_nsrequire/147491859.js",
  "/assets/suitescript_bootstrap/1633197298.js",
  "/assets/suitescript_event/2156200013.js"
];
const NETSUITE_RUNTIME_PARALLEL_SCRIPTS = [
  "/javascript/suitescript/2.1/client/N.js",
  "/javascript/suitescript/ts/bundle/NU-bundle.js"
];

const netsuiteRuntimeScriptLoads = new Map();
let netsuiteRuntimeLoadPromise = null;
let cachedNetsuiteApi = null;

const getNetsuiteRuntimeQuery = () => {
  const buildVersion =
    location.search.match(/[?&]buildver=(\d+)/)?.[1] || "30054";
  return `NS_VER=2026.1&minver=14&buildver=${buildVersion}`;
};

const getAmdRequire = () => {
  if (typeof require === "function") return require;
  if (typeof window.require === "function") return window.require;
  return null;
};

const requireNModule = () => {
  return new Promise((resolve) => {
    const amdRequire = getAmdRequire();
    if (!amdRequire) {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (module) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(module || null);
    };

    const timer = setTimeout(() => finish(null), NETSUITE_REQUIRE_TIMEOUT_MS);

    try {
      amdRequire(
        ["N"],
        (NModule) => finish(NModule),
        (err) => {
          console.warn('[Magic Netsuite] require(["N"]) failed', err);
          finish(null);
        }
      );
    } catch (err) {
      console.warn('[Magic Netsuite] require(["N"]) threw', err);
      finish(null);
    }
  });
};

const loadNetsuiteRuntimeScript = (src, query) => {
  const cacheKey = `${src}?${query}`;
  if (netsuiteRuntimeScriptLoads.has(cacheKey)) {
    return netsuiteRuntimeScriptLoads.get(cacheKey);
  }

  const loadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = cacheKey;
    script.dataset.magicNetsuiteRuntime = src;
    script.onload = () => resolve();
    script.onerror = (err) => {
      console.warn(`[Magic Netsuite] Failed to load ${src}`, err);
      resolve();
    };
    (document.head || document.documentElement).appendChild(script);
  });

  netsuiteRuntimeScriptLoads.set(cacheKey, loadPromise);
  return loadPromise;
};

const ensureNetsuiteRuntimeLoaded = () => {
  if (!netsuiteRuntimeLoadPromise) {
    netsuiteRuntimeLoadPromise = (async () => {
      const query = getNetsuiteRuntimeQuery();

      for (const script of NETSUITE_RUNTIME_SCRIPTS) {
        await loadNetsuiteRuntimeScript(script, query);
      }

      await Promise.all(
        NETSUITE_RUNTIME_PARALLEL_SCRIPTS.map((script) =>
          loadNetsuiteRuntimeScript(script, query)
        )
      );
    })();
  }

  return netsuiteRuntimeLoadPromise;
};

const loadNetsuiteApi = async () => {
  if (cachedNetsuiteApi) return cachedNetsuiteApi;

  const existingModule = await requireNModule();
  if (existingModule) {
    cachedNetsuiteApi = existingModule;
    window.N = existingModule;
    return cachedNetsuiteApi;
  }

  console.log(
    "[Magic Netsuite] SuiteScript runtime not present; loading it in-page"
  );
  await ensureNetsuiteRuntimeLoaded();

  const loadedModule = await requireNModule();
  if (loadedModule) {
    cachedNetsuiteApi = loadedModule;
    window.N = loadedModule;
  }

  return cachedNetsuiteApi;
};

// Central listener for messages from the extension
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== "FROM_EXTENSION") return;

  const { requestId, action, data, mode } = event.data.payload;

  const payload = {
    requestId,
    mode,
    ...data
  };

  const handler = handlers[action];
  if (!handler) {
    return sendToExtension({
      requestId,
      status: "error",
      message: `No handler for ${action}`
    });
  }

  try {
    const modules = await loadNetsuiteApi();
    console.log("Modules:", modules);

    if (!modules) {
      console.log("Could not load netsuiteApi");
      sendToExtension({ requestId, status: "API_NOT_AVAILABLE" });
      return;
    }

    const csrfToken = document.querySelector('input[name="_csrf"]')?.value;

    const result =
      (await handler({ modules, payload, csrfToken: csrfToken })) || null;

    sendToExtension({ requestId, status: "ok", message: result });
  } catch (err) {
    console.log("Error:", err);
    // Safely extract a string message from any thrown value.
    // NetSuite SuiteScript errors can have .message as an object or be
    // thrown as a plain object — both produce "[object Object]" if coerced
    // directly via new Error() or string concatenation.
    let errMsg;
    if (typeof err === "string") {
      errMsg = err;
    } else if (err && typeof err.message !== "undefined") {
      errMsg =
        typeof err.message === "string"
          ? err.message
          : JSON.stringify(err.message);
    } else if (err) {
      errMsg = JSON.stringify(err);
    } else {
      errMsg = "Unknown error";
    }
    sendToExtension({ requestId, status: "error", message: errMsg });
  }
});

const sendToExtension = (msg) => {
  window.postMessage({ type: "TO_EXTENSION", payload: msg }, "*");
};

const normalizeMetadataScriptId = (value, prefix) => {
  if (value === undefined || value === null || value === "") return value;

  const raw = String(value).trim();
  const lowerPrefix = prefix.toLowerCase();
  let suffix = raw;

  if (suffix.toLowerCase().startsWith(lowerPrefix)) {
    suffix = suffix.slice(prefix.length);
  }

  suffix = suffix.replace(/^_+/, "");
  return `_${suffix}`;
};

const getMetadataScriptId = (scriptIdSuffix, prefix) => {
  if (
    scriptIdSuffix === undefined ||
    scriptIdSuffix === null ||
    scriptIdSuffix === ""
  ) {
    return "";
  }

  const suffix = String(scriptIdSuffix).replace(/^_+/, "");
  return `${prefix}_${suffix}`;
};

const normalizeSelectRecordTypeReference = (value) => {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (/^-\d+$/.test(trimmed)) return trimmed;
  if (!trimmed.startsWith("-")) return trimmed;

  const suffix = trimmed.slice(1).replace(/^customrecord_?/i, "");
  return `customrecord_${suffix}`;
};

const sqlLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;

const firstSuiteQLRow = async (N, sql) => {
  const result = await window.runSuiteQLQuery(N, sql, 1);
  const rows = Array.isArray(result) ? result : (result?.results ?? []);
  return rows[0] ?? null;
};

const getNormalizedFieldType = (rec, fieldId) => {
  try {
    const field = rec.getField({ fieldId });
    return String(field?.type ?? "").toLowerCase();
  } catch {
    return "";
  }
};

const coerceDateValue = (value) => {
  if (value instanceof Date) return value;
  if (value === true || value === "" || value === null || value === undefined) {
    return new Date();
  }

  const raw = String(value).trim();
  const date =
    !raw || raw.toLowerCase() === "now" || raw.toLowerCase() === "today"
      ? new Date()
      : new Date(value);

  return Number.isNaN(date.getTime()) ? value : date;
};

const normalizeRecordFieldValue = (N, rec, fieldId, value) => {
  const fieldType = getNormalizedFieldType(rec, fieldId);
  if (!fieldType) return value;

  const isDateTime =
    fieldType === "datetime" ||
    fieldType === "datetimetz" ||
    fieldType.includes("datetime");
  const isDate = fieldType === "date";

  if (!isDateTime && !isDate) return value;

  const date = coerceDateValue(value);
  if (!(date instanceof Date)) return value;

  return date;
};

const normalizeRecordValues = (N, rec, values) =>
  Object.fromEntries(
    Object.entries(values || {}).map(([fieldId, value]) => [
      fieldId,
      normalizeRecordFieldValue(N, rec, fieldId, value)
    ])
  );

const setRecordValues = (N, rec, values, skipFieldIds = new Set()) => {
  Object.keys(values || {}).forEach((fieldId) => {
    const value = values[fieldId];
    if (value !== undefined && !skipFieldIds.has(fieldId)) {
      rec.setValue({
        fieldId,
        value: normalizeRecordFieldValue(N, rec, fieldId, value)
      });
    }
  });
};

const assertFieldValueMap = (values, name = "values") => {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error(`${name} must be an object mapping field IDs to values.`);
  }

  const entries = Object.entries(values).filter(
    ([fieldId, value]) => fieldId && value !== undefined
  );
  if (entries.length === 0) {
    throw new Error(`${name} must contain at least one field value.`);
  }

  return Object.fromEntries(entries);
};

const createRecord = (N, args = {}) => {
  const { record } = N;
  const type = String(args.recordType ?? args.type ?? "").trim();
  if (!type) throw new Error("recordType is required.");

  const values = assertFieldValueMap(args.values ?? args.fieldValues);
  const rec = record.create({
    type,
    isDynamic: args.isDynamic === true,
    ...(args.defaultValues && typeof args.defaultValues === "object"
      ? { defaultValues: args.defaultValues }
      : {})
  });

  setRecordValues(N, rec, values);

  const id = rec.save({
    enableSourcing: args.enableSourcing !== false,
    ignoreMandatoryFields: args.ignoreMandatoryFields === true
  });

  return {
    success: true,
    recordType: type,
    recordId: String(id),
    id,
    valuesSet: Object.keys(values)
  };
};

const updateRecordFields = (N, args = {}) => {
  const { record } = N;
  const type = String(args.recordType ?? args.type ?? "").trim();
  const id = String(args.recordId ?? args.id ?? "").trim();
  if (!type) throw new Error("recordType is required.");
  if (!id) throw new Error("recordId is required.");

  const values = assertFieldValueMap(args.values ?? args.fieldValues);
  const rec = record.load({
    type,
    id,
    isDynamic: false
  });
  const normalizedValues = normalizeRecordValues(N, rec, values);

  const updatedId = record.submitFields({
    type,
    id,
    values: normalizedValues,
    options: {
      enableSourcing: args.enableSourcing !== false,
      ignoreMandatoryFields: args.ignoreMandatoryFields === true
    }
  });

  return {
    success: true,
    recordType: type,
    recordId: String(updatedId ?? id),
    id: updatedId ?? id,
    valuesSet: Object.keys(values)
  };
};

const getSelectOptions = (rec, fieldId, filter = "") => {
  try {
    const field = rec.getField({ fieldId });
    if (!field || typeof field.getSelectOptions !== "function") return [];
    return (
      field.getSelectOptions({
        filter: String(filter ?? ""),
        operator: "contains"
      }) || []
    );
  } catch {
    return [];
  }
};

const resolveSelectOptionValue = (rec, fieldId, inputValue) => {
  if (inputValue === undefined || inputValue === null || inputValue === "") {
    return inputValue;
  }

  const raw = String(inputValue).trim();
  const options = [
    ...getSelectOptions(rec, fieldId, raw),
    ...getSelectOptions(rec, fieldId, "")
  ];
  const lower = raw.toLowerCase();
  const match = options.find((option) => {
    const value = String(option.value ?? "").toLowerCase();
    const text = String(option.text ?? "").toLowerCase();
    return value === lower || text === lower;
  });

  return match ? match.value : inputValue;
};

const getCustomRecordSelectRecordTypeOptions = (N, { filter = "" } = {}) => {
  const { record } = N;
  const customField = record.create({
    type: "customrecordcustomfield",
    isDynamic: true
  });

  try {
    customField.setValue({ fieldId: "fieldtype", value: "SELECT" });
  } catch {
    try {
      customField.setValue({ fieldId: "fieldtype", value: "LIST" });
    } catch {}
  }

  const options = getSelectOptions(customField, "selectrecordtype", filter);
  return {
    success: true,
    fieldId: "selectrecordtype",
    count: options.length,
    options: options.map((option) => ({
      value: option.value,
      text: option.text
    }))
  };
};

const findCustomRecordTypeByScriptId = async (N, scriptId) => {
  const expectedScriptId = getFullMetadataScriptId(scriptId, "CUSTOMRECORD");
  const sql = `
SELECT
  InternalID,
  Name,
  ScriptID
FROM
  CustomRecordType
WHERE
  UPPER(ScriptID) = UPPER(${sqlLiteral(expectedScriptId)})
  AND ROWNUM <= 1
`;
  return firstSuiteQLRow(N, sql);
};

const resolveCustomFieldSelectRecordType = async (N, inputValue) => {
  if (inputValue === undefined || inputValue === null || inputValue === "") {
    return { value: inputValue, source: "empty" };
  }

  const raw = String(inputValue).trim();
  const customRecordCandidate = raw.replace(/^-/, "");
  if (/^customrecord_/i.test(customRecordCandidate)) {
    const row = await findCustomRecordTypeByScriptId(N, customRecordCandidate);
    if (!row) {
      throw new Error(
        `selectRecordType ${raw} did not match a custom record type script ID. ` +
          "Pass the custom record type internal ID or create the referenced custom record type first."
      );
    }

    return {
      value: String(row.internalid ?? row.InternalID),
      source: "customrecord-scriptid",
      matched: row
    };
  }

  const optionsPayload = getCustomRecordSelectRecordTypeOptions(N, {
    filter: raw.replace(/^-/, "")
  });
  const allOptions =
    optionsPayload.options.length > 0
      ? optionsPayload.options
      : getCustomRecordSelectRecordTypeOptions(N, {}).options;
  const lower = raw.toLowerCase();
  const match = allOptions.find((option) => {
    const value = String(option.value ?? "").toLowerCase();
    const text = String(option.text ?? "").toLowerCase();
    return value === lower || text === lower;
  });

  if (match) {
    return {
      value: String(match.value),
      source: "selectrecordtype-options",
      matched: match
    };
  }

  if (/^\d+$/.test(raw)) {
    return { value: raw, source: "numeric-internal-id" };
  }

  if (/^-\d+$/.test(raw)) {
    throw new Error(
      `selectRecordType ${raw} is not available in the live selectrecordtype options for this account. ` +
        "Call GET_CUSTOM_RECORD_SELECT_RECORD_TYPES and use one of the returned values."
    );
  }

  return { value: raw, source: "raw" };
};

const getRecordFieldSnapshot = (rec, fieldId) => {
  const snapshot = { fieldId };

  try {
    const field = rec.getField({ fieldId });
    if (field) {
      snapshot.label = field.label ?? null;
      snapshot.type = field.type ?? null;
      snapshot.isMandatory = field.isMandatory ?? null;
    }
  } catch (err) {
    snapshot.fieldError = err?.message || String(err);
  }

  try {
    snapshot.value = rec.getValue({ fieldId });
  } catch (err) {
    snapshot.valueError = err?.message || String(err);
  }

  try {
    snapshot.text = rec.getText({ fieldId });
  } catch {
    snapshot.text = null;
  }

  return snapshot;
};

const getFullMetadataScriptId = (value, prefix) => {
  if (value === undefined || value === null || value === "") return value;

  const raw = String(value).trim();
  const lowerPrefix = prefix.toLowerCase();
  let suffix = raw;

  if (suffix.toLowerCase().startsWith(lowerPrefix)) {
    suffix = suffix.slice(prefix.length);
  }

  suffix = suffix.replace(/^_+/, "");
  return `${prefix}_${suffix}`;
};

const CUSTOM_RECORD_FIELD_UI_TYPES = {
  FREEFORMTEXT: "TEXT",
  TEXT: "TEXT",
  TEXTAREA: "TEXTAREA",
  LONGTEXT: "LONGTEXT",
  RICHTEXT: "RICHTEXT",
  CHECKBOX: "CHECKBOX",
  CURRENCY: "CURRENCY",
  DATE: "DATE",
  DATETIME: "DATETIME",
  DECIMAL: "DECIMAL",
  DOCUMENT: "DOCUMENT",
  EMAIL: "EMAIL",
  HELP: "HELP",
  HYPERLINK: "HYPERLINK",
  INLINEHTML: "INLINEHTML",
  INTEGER: "INTEGER",
  LIST: "SELECT",
  SELECT: "SELECT",
  MULTISELECT: "MULTISELECT",
  PASSWORD: "PASSWORD",
  PERCENT: "PERCENT",
  PHONE: "PHONE",
  TIMEOFDAY: "TIMEOFDAY"
};

const CUSTOM_RECORD_FIELD_UI_LABELS = {
  TEXT: "Free-Form Text",
  TEXTAREA: "Text Area",
  LONGTEXT: "Long Text",
  RICHTEXT: "Rich Text",
  CHECKBOX: "Check Box",
  CURRENCY: "Currency",
  DATE: "Date",
  DATETIME: "Date/Time",
  DECIMAL: "Decimal Number",
  DOCUMENT: "Document",
  EMAIL: "Email Address",
  HELP: "Help",
  HYPERLINK: "Hyperlink",
  INLINEHTML: "Inline HTML",
  INTEGER: "Integer Number",
  SELECT: "List/Record",
  MULTISELECT: "Multiple Select",
  PASSWORD: "Password",
  PERCENT: "Percent",
  PHONE: "Phone Number",
  TIMEOFDAY: "Time of Day"
};

const normalizeCustomRecordFieldUiType = (value) => {
  if (value === undefined || value === null || value === "") return value;
  const upper = String(value).trim().toUpperCase();
  return CUSTOM_RECORD_FIELD_UI_TYPES[upper] || upper;
};

const readFormDefaults = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const form = doc.querySelector("form") || doc;
  const params = new URLSearchParams();

  form.querySelectorAll("input, select, textarea").forEach((element) => {
    const name = element.getAttribute("name");
    if (!name || element.disabled) return;

    const tagName = element.tagName.toLowerCase();
    const type = (element.getAttribute("type") || "").toLowerCase();

    if ((type === "checkbox" || type === "radio") && !element.checked) {
      return;
    }

    if (tagName === "select") {
      const selected = Array.from(element.options).filter(
        (option) => option.selected
      );
      const options =
        selected.length > 0 ? selected : [element.options[0]].filter(Boolean);
      options.forEach((option) => params.append(name, option.value));
      return;
    }

    params.append(name, element.value ?? "");
  });

  return { doc, params };
};

const getSelectOptionTextFromDocument = (doc, fieldName, value) => {
  const option = doc.querySelector(
    `select[name="${fieldName}"] option[value="${String(value).replace(/"/g, '\\"')}"]`
  );
  return option?.textContent?.trim() || null;
};

const setIfPresent = (params, key, value) => {
  if (value !== undefined && value !== null) {
    params.set(key, String(value));
  }
};

const extractCustomRecordFieldIdFromHtml = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const idInput = doc.querySelector('input[name="id"]');
  if (idInput && /^\d+$/.test(idInput.value)) return idInput.value;

  const urlMatch = html.match(/custreccustfield\.nl\?[^"'<>]*[?&]id=(\d+)/i);
  if (urlMatch) return urlMatch[1];

  const scrollMatch = html.match(/[?&]scrollid=(\d+)/i);
  if (scrollMatch) return scrollMatch[1];

  return null;
};

const extractScriptFieldIdFromHtml = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const idInput = doc.querySelector('input[name="id"]');
  if (idInput && /^\d+$/.test(idInput.value)) return idInput.value;

  const urlMatch = html.match(/scriptcustfield\.nl\?[^"'<>]*[?&]id=(\d+)/i);
  if (urlMatch) return urlMatch[1];

  const scrollMatch = html.match(/[?&]scrollid=(\d+)/i);
  if (scrollMatch) return scrollMatch[1];

  return null;
};

const extractNetSuiteFormError = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const selectors = [
    ".uir-message-error",
    ".uir-alert-box.error",
    ".uir-error",
    "[class*='error']"
  ];

  for (const selector of selectors) {
    const node = doc.querySelector(selector);
    const text = node?.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }

  return null;
};

const buildCustomRecordTypeValues = (args = {}) => {
  const values = {
    ...(args.name !== undefined ? { recordname: args.name } : {}),
    ...(args.scriptId !== undefined ? { scriptid: args.scriptId } : {}),
    ...(args.description !== undefined
      ? { description: args.description }
      : {}),
    ...(args.recordFields && typeof args.recordFields === "object"
      ? args.recordFields
      : {})
  };

  if (values.scriptid !== undefined) {
    values.scriptid = normalizeMetadataScriptId(
      values.scriptid,
      "customrecord"
    );
  }

  return values;
};

const buildCustomRecordFieldValues = (args = {}) => {
  const values = {
    ...(args.label !== undefined ? { label: args.label } : {}),
    ...(args.scriptId !== undefined ? { scriptid: args.scriptId } : {}),
    ...(args.fieldType !== undefined ? { fieldtype: args.fieldType } : {}),
    ...(args.selectRecordType !== undefined
      ? { selectrecordtype: args.selectRecordType }
      : {}),
    ...(args.description !== undefined
      ? { description: args.description }
      : {}),
    ...(args.storeValue !== undefined ? { storevalue: args.storeValue } : {}),
    ...(args.showInList !== undefined ? { isshowinlist: args.showInList } : {}),
    ...(args.fieldValues && typeof args.fieldValues === "object"
      ? args.fieldValues
      : {})
  };

  if (values.scriptid !== undefined) {
    values.scriptid = normalizeMetadataScriptId(values.scriptid, "custrecord");
  }

  if (values.selectrecordtype !== undefined) {
    values.selectrecordtype = normalizeSelectRecordTypeReference(
      values.selectrecordtype
    );
  }

  return values;
};

const buildScriptFieldValues = (args = {}) => {
  const values = {
    ...(args.label !== undefined ? { label: args.label } : {}),
    ...(args.scriptId !== undefined ? { scriptid: args.scriptId } : {}),
    ...(args.fieldType !== undefined ? { fieldtype: args.fieldType } : {}),
    ...(args.selectRecordType !== undefined
      ? { selectrecordtype: args.selectRecordType }
      : {}),
    ...(args.description !== undefined
      ? { description: args.description }
      : {}),
    ...(args.storeValue !== undefined ? { storevalue: args.storeValue } : {}),
    ...(args.fieldValues && typeof args.fieldValues === "object"
      ? args.fieldValues
      : {})
  };

  if (values.scriptid !== undefined) {
    values.scriptid = normalizeMetadataScriptId(values.scriptid, "custscript");
  }

  if (values.selectrecordtype !== undefined) {
    values.selectrecordtype = normalizeSelectRecordTypeReference(
      values.selectrecordtype
    );
  }

  return values;
};

const findExistingCustomRecordType = async (N, recordValues) => {
  const conditions = [];
  const expectedScriptId = getMetadataScriptId(
    recordValues.scriptid,
    "CUSTOMRECORD"
  );

  if (expectedScriptId) {
    conditions.push(`UPPER(ScriptID) = UPPER(${sqlLiteral(expectedScriptId)})`);
  }

  if (recordValues.recordname) {
    conditions.push(
      `UPPER(Name) = UPPER(${sqlLiteral(recordValues.recordname)})`
    );
  }

  if (conditions.length === 0) return null;

  const sql = `
SELECT
  InternalID,
  Name,
  ScriptID
FROM
  CustomRecordType
WHERE
  (${conditions.join(" OR ")})
  AND ROWNUM <= 1
`;

  try {
    return await firstSuiteQLRow(N, sql);
  } catch (err) {
    console.warn(
      "[createCustomRecordType] Existing record lookup failed:",
      err
    );
    return null;
  }
};

const findExistingCustomRecordField = async (
  N,
  customRecordTypeId,
  fieldValues
) => {
  const expectedScriptId = getMetadataScriptId(
    fieldValues.scriptid,
    "CUSTRECORD"
  );
  if (!expectedScriptId) return null;

  const sql = `
SELECT
  InternalID,
  Name,
  ScriptID,
  RecordType
FROM
  CustomField
WHERE
  UPPER(ScriptID) = UPPER(${sqlLiteral(expectedScriptId)})
  AND RecordType = ${Number(customRecordTypeId)}
  AND ROWNUM <= 1
`;

  try {
    return await firstSuiteQLRow(N, sql);
  } catch (err) {
    console.warn(
      "[createCustomRecordField] Existing field lookup failed:",
      err
    );
    return null;
  }
};

const findExistingScriptField = async (N, fieldValues) => {
  const expectedScriptId = getMetadataScriptId(
    fieldValues.scriptid,
    "CUSTSCRIPT"
  );
  if (!expectedScriptId) return null;

  const sql = `
SELECT
  InternalID,
  Name,
  ScriptID
FROM
  CustomField
WHERE
  UPPER(ScriptID) = UPPER(${sqlLiteral(expectedScriptId)})
  AND ROWNUM <= 1
`;

  try {
    return await firstSuiteQLRow(N, sql);
  } catch (err) {
    console.warn("[createScriptField] Existing field lookup failed:", err);
    return null;
  }
};

const createCustomRecordType = async (N, args = {}) => {
  const { record } = N;
  const customFields = Array.isArray(args.customFields)
    ? args.customFields
    : [];

  if (customFields.length > 0) {
    throw new Error(
      "customFields is no longer supported on CREATE_CUSTOM_RECORD_TYPE because the record type is saved before field creation. " +
        "Create the record type first, then call CREATE_CUSTOM_RECORD_FIELD for each field."
    );
  }

  const recordValues = buildCustomRecordTypeValues(args);
  if (Object.keys(recordValues).length === 0) {
    throw new Error(
      "Provide at least one custom record type field, such as name, scriptId, or recordFields."
    );
  }

  const existing = await findExistingCustomRecordType(N, recordValues);
  if (existing) {
    return {
      success: true,
      existed: true,
      customRecordTypeId: existing.internalid ?? existing.InternalID,
      recordType: "customrecordtype",
      existing,
      recordValues,
      note: "A matching custom record type already exists; returning its ID instead of creating a duplicate."
    };
  }

  const customRecordType = record.create({
    type: "customrecordtype",
    isDynamic: false
  });
  setRecordValues(N, customRecordType, recordValues);
  const customRecordTypeId = customRecordType.save();

  return {
    success: true,
    existed: false,
    customRecordTypeId,
    recordType: "customrecordtype",
    recordValues,
    note: "Create custom fields with CREATE_CUSTOM_RECORD_FIELD after confirming this ID."
  };
};

const getCustomRecordFieldTypes = (N, { filter = "" } = {}) => {
  const { record } = N;
  const customField = record.create({
    type: "customrecordcustomfield",
    isDynamic: true
  });
  const fieldTypeField = customField.getField({ fieldId: "fieldtype" });
  const options =
    fieldTypeField.getSelectOptions({
      filter: String(filter ?? ""),
      operator: "contains"
    }) || [];

  return {
    success: true,
    fieldId: "fieldtype",
    count: options.length,
    options: options.map((option) => ({
      value: option.value,
      text: option.text
    }))
  };
};

const createCustomRecordField = async (N, args = {}) => {
  const { runtime, url } = N;
  const customRecordTypeId = String(
    args.customRecordTypeId ?? args.customRecordTypeInternalId ?? ""
  );
  if (!customRecordTypeId) {
    throw new Error("customRecordTypeId is required.");
  }

  const fieldValues = buildCustomRecordFieldValues(args);
  if (!fieldValues.fieldtype) {
    throw new Error(
      "fieldType is required. Call GET_CUSTOM_RECORD_FIELD_TYPES for valid values."
    );
  }

  const existing = await findExistingCustomRecordField(
    N,
    customRecordTypeId,
    fieldValues
  );
  if (existing) {
    return {
      success: true,
      existed: true,
      id: existing.internalid ?? existing.InternalID,
      recordType: "customrecordcustomfield",
      rectype: customRecordTypeId,
      existing,
      fieldValues,
      note: "A matching custom record field already exists on this custom record type; returning its ID instead of creating a duplicate."
    };
  }

  const requestedFieldType = fieldValues.fieldtype;
  let resolvedFieldType =
    normalizeCustomRecordFieldUiType(requestedFieldType);
  fieldValues.fieldtype = resolvedFieldType;

  const domain = url?.resolveDomain
    ? url.resolveDomain({ hostType: url.HostType.APPLICATION })
    : window.location.host;
  const recordTypeUrl = `https://${domain}/app/common/custom/custrecord.nl?id=${encodeURIComponent(
    customRecordTypeId
  )}`;
  const { accountId, csrfToken } = window.getNetsiteParams();
  const currentUser = runtime?.getCurrentUser ? runtime.getCurrentUser() : {};
  const ownerId = String(currentUser.id ?? "");
  const ownerName = currentUser.name || "";
  const scriptId = fieldValues.scriptid;
  const fieldTypeText =
    CUSTOM_RECORD_FIELD_UI_LABELS[resolvedFieldType] || resolvedFieldType;
  const storeValue =
    fieldValues.storevalue === undefined
      ? "T"
      : fieldValues.storevalue
        ? "T"
        : "F";
  let selectRecordTypeFallbackNote = null;
  if (
    (resolvedFieldType === "SELECT" || resolvedFieldType === "MULTISELECT") &&
    (fieldValues.selectrecordtype === undefined ||
      fieldValues.selectrecordtype === null ||
      fieldValues.selectrecordtype === "")
  ) {
    selectRecordTypeFallbackNote =
      "fieldType was SELECT/MULTISELECT but no selectRecordType was provided; defaulted to TEXT.";
    resolvedFieldType = "TEXT";
    fieldValues.fieldtype = "TEXT";
  }

  const resolvedSelectRecordType =
    resolvedFieldType === "SELECT" || resolvedFieldType === "MULTISELECT"
      ? await resolveCustomFieldSelectRecordType(
          N,
          fieldValues.selectrecordtype
        )
      : null;
  if (resolvedSelectRecordType?.value) {
    fieldValues.selectrecordtype = resolvedSelectRecordType.value;
  }

  const params = new URLSearchParams({
    submitter: "Save",
    label: fieldValues.label ?? "",
    label_send: fieldValues.label ?? "",
    scriptid: scriptId ?? "",
    fieldid: scriptId ?? "",
    inpt_owner: ownerName,
    owner: ownerId,
    description: fieldValues.description ?? "",
    inpt_fieldtype: fieldTypeText,
    fieldtype: resolvedFieldType,
    storevalue: storeValue,
    storevalue_send: storeValue,
    _eml_nkey_: `${accountId}~${ownerId}~${currentUser.role ?? ""}~N`,
    _multibtnstate_: "",
    selectedtab: "DISPLAY",
    nsapiPI: "",
    nsapiSR: "",
    nsapiVF: "",
    nsapiFC: "",
    nsapiPS: "",
    nsapiVI: "",
    nsapiVD: "",
    nsapiPD: "",
    nsapiVL: "",
    nsapiRC: "",
    nsapiLI: "",
    nsapiLC: "",
    nsapiCT: Date.now().toString(),
    nsbrowserenv: "istop=T",
    type: "custrecordfield",
    id: "",
    externalid: "",
    whence: `/app/common/custom/custrecord.nl?id=${customRecordTypeId}`,
    customwhence: "",
    entryformquerystring: `rectype=${customRecordTypeId}&e=T`,
    _csrf: csrfToken,
    originchannel: "UI",
    fldcurrenttype: resolvedFieldType,
    originalfieldtype: resolvedFieldType,
    originalselectrecordtype: "",
    fldselectishierarchical: "F",
    fldselectislist: "",
    fldcurselrectype: "",
    fldcurrstored: storeValue,
    insertbefore: "",
    subtab: "",
    fldtabsection: "",
    displaytype: "NORMAL",
    fldsizelabel: "",
    displaywidth: "",
    displayheight: "",
    applyformatting: "F",
    isunformattedcurrency: "F",
    help: "",
    parentsubtab: "",
    linktext: "",
    showhierarchy: "F",
    ismandatory: "F",
    checkspelling: "F",
    maxlength: "",
    minvalue: "",
    maxvalue: "",
    defaultchecked: "F",
    defaultvalue: "",
    defaultvaluerte: "",
    isformula: "F",
    defaultselection: "",
    dynamicdefault: "",
    searchdefault: "",
    searchcomparefield: "",
    onparentdelete: "NO_ACTION",
    sourcelist: "",
    sourcefrom: "",
    sourcefilterby: "",
    sourcefromtype: "",
    sourcefromtypedisplay: "",
    sourcefromrecordtype: "",
    sourcefromrecordtypedisplay: "",
    sourcefilterbyrecordtype: "",
    sourcefilterbyrecordtypedisplay: "",
    sourcelistrecordtype: "",
    sourcelistrecordtypedisplay: "",
    sourcefilterreferencedbycount: "0",
    staticfieldtype: resolvedFieldType,
    staticlistrecordtype: "",
    usedassource: "F",
    customsegment: "",
    rectype: customRecordTypeId,
    allowquickadd: "F",
    accesslevel: "2",
    searchlevel: "2",
    colreflabel: "T",
    colrefhelp: "T",
    aidescription: "",
    submitted: "T",
    formdisplayview: "NONE",
    _button: "",
    customfieldfilterfields:
      "fldfilter_display\x01fldfilter\x01fldfiltertype\x01fldfilterchecked\x01fldfiltercomparetype\x01fldfilterval\x01fldfiltersel_display\x01fldfiltersel\x01fldfiltersel_labels\x01fldfilternotnull\x01fldfilternull\x01fldcomparefield_display\x01fldcomparefield\x01fldselecttype",
    customfieldfilterflags:
      "8\x011\x010\x010\x010\x010\x018\x010\x01\x010\x010\x018\x010\x010",
    customfieldfilterfieldsets:
      "\x01\x01\x01\x01\x01\x01\x01\x01customfieldfilter.fldfilter\x01\x01\x01\x01\x01",
    customfieldfiltertypes:
      "text\x01integer\x01text\x01checkbox\x01select\x01text\x01textarea\x01slaveselect\x01text\x01checkbox\x01checkbox\x01text\x01slaveselect\x01integer",
    customfieldfilterorigtypes:
      "\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01",
    customfieldfilterparents:
      "selectrecordtype\x01selectrecordtype\x01customfieldfilter.fldfilter\x01\x01\x01\x01customfieldfilter.fldfilter\x01customfieldfilter.fldfilter\x01\x01\x01\x01customfieldfilter.fldfilter\x01customfieldfilter.fldfilter\x01",
    customfieldfilterlabels:
      "Filter Using\x01\x01\x01Is Checked\x01Compare Type\x01Compare Value to\x01Value Is\x01\x01\x01Is Not Empty\x01Is Empty\x01Compare to Field\x01\x01",
    customfieldfilterdata: "",
    nextcustomfieldfilteridx: "1",
    customfieldfiltervalid: "T",
    customfieldfilterloaded: "F",
    roleaccessfields: "role\x01accesslevel\x01searchlevel",
    roleaccessflags: "1\x011\x011",
    roleaccessfieldsets: "\x01\x01",
    roleaccesstypes: "select\x01select\x01select",
    roleaccessorigtypes: "\x01\x01",
    roleaccessparents: "\x01\x01",
    roleaccesslabels: "Role\x01Access Level\x01Level for Search/Reporting",
    roleaccessdata: "",
    nextroleaccessidx: "1",
    roleaccessvalid: "T",
    roleaccessloaded: "T",
    deptaccessfields: "dept\x01accesslevel\x01searchlevel",
    deptaccessflags: "1\x011\x011",
    deptaccessfieldsets: "\x01\x01",
    deptaccesstypes: "select\x01select\x01select",
    deptaccessorigtypes: "\x01\x01",
    deptaccessparents: "\x01\x01",
    deptaccesslabels:
      "Department\x01Access Level\x01Level for Search/Reporting",
    deptaccessdata: "",
    nextdeptaccessidx: "1",
    deptaccessvalid: "T",
    deptaccessloaded: "F",
    subaccessfields: "sub\x01accesslevel\x01searchlevel",
    subaccessflags: "1\x011\x011",
    subaccessfieldsets: "\x01\x01",
    subaccesstypes: "select\x01select\x01select",
    subaccessorigtypes: "\x01\x01",
    subaccessparents: "\x01\x01",
    subaccesslabels: "Subsidiary\x01Access Level\x01Level for Search/Reporting",
    subaccessdata: "",
    nextsubaccessidx: "1",
    subaccessvalid: "T",
    subaccessloaded: "F",
    securityhistoryloaded: "F",
    securityhistorydotted: "T",
    translationsfields: "locale\x01language\x01label\x01help",
    translationsflags: "0\x010\x014\x014",
    translationsfieldsets: "\x01\x01\x01",
    translationstypes: "text\x01text\x01text\x01textarea",
    translationsorigtypes: "\x01\x01\x01",
    translationsparents: "\x01\x01\x01",
    translationslabels: "\x01Language\x01Label\x01Help",
    translationsdata:
      "en\x01English (International)\x01\x01\x02fr_FR\x01French (France)\x01\x01\x02de_DE\x01German\x01\x01\x02it_IT\x01Italian\x01\x01",
    nexttranslationsidx: "5",
    translationsvalid: "T",
    translationssortidx: "0",
    translationssorttype: "TEXT",
    translationssortdir: "UP",
    translationssortname: "language",
    translationssort2dir: "",
    translationssort2name: "",
    historyloaded: "F",
    historydotted: "F",
    systemnotesloaded: "F",
    systemnotesdotted: "F"
  });

  if (ownerId) setIfPresent(params, "owner", ownerId);
  if (ownerName) setIfPresent(params, "inpt_owner", ownerName);
  if (fieldValues.isshowinlist !== undefined) {
    const showInList = fieldValues.isshowinlist ? "T" : "F";
    setIfPresent(params, "showinlist", showInList);
    setIfPresent(params, "isshowinlist", showInList);
  }
  if (fieldValues.selectrecordtype !== undefined) {
    setIfPresent(params, "selectrecordtype", fieldValues.selectrecordtype);
    setIfPresent(params, "fldcurselrectype", fieldValues.selectrecordtype);
    setIfPresent(params, "fldselectislist", "T");
    setIfPresent(params, "staticlistrecordtype", fieldValues.selectrecordtype);
  } else if (resolvedFieldType === "SELECT" || resolvedFieldType === "MULTISELECT") {
    throw new Error(
      "selectRecordType is required when fieldType is SELECT or MULTISELECT. " +
        "Call GET_CUSTOM_RECORD_SELECT_RECORD_TYPES and use a returned value."
    );
  }

  Object.entries(fieldValues).forEach(([fieldId, value]) => {
    if (
      value !== undefined &&
      ![
        "label",
        "scriptid",
        "description",
        "fieldtype",
        "storevalue",
        "isshowinlist"
      ].includes(fieldId)
    ) {
      setIfPresent(params, fieldId, value);
    }
  });

  const response = await fetch(
    `https://${domain}/app/common/custom/custreccustfield.nl`,
    {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "it-IT,it;q=0.6",
        "cache-control": "max-age=0",
        "content-type": "application/x-www-form-urlencoded",
        priority: "u=0, i",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1"
      },
      referrer: recordTypeUrl,
      body: params.toString()
    }
  );

  const html = await response.text();
  if (!response.ok) {
    throw new Error(
      `Custom record field form save failed: HTTP ${response.status}`
    );
  }

  const formError = extractNetSuiteFormError(html);
  const id = extractCustomRecordFieldIdFromHtml(html);
  if (!id && formError) {
    throw new Error(`Custom record field form save failed: ${formError}`);
  }
  if (!id) {
    throw new Error(
      `Custom record field form save completed but no field ID was found in the response. ${html
        .replace(/\s+/g, " ")
        .slice(0, 500)}`
    );
  }

  return {
    success: true,
    existed: false,
    id,
    recordType: "customrecordcustomfield",
    rectype: customRecordTypeId,
    url: `https://${domain}/app/common/custom/custreccustfield.nl?rectype=${encodeURIComponent(
      customRecordTypeId
    )}&e=T&id=${encodeURIComponent(id)}`,
    parentUrl: recordTypeUrl,
    fieldValues,
    resolved: {
      fieldtype: {
        requested: requestedFieldType,
        value: resolvedFieldType
      },
      ...(selectRecordTypeFallbackNote
        ? {
            selectrecordtypeFallback: {
              note: selectRecordTypeFallbackNote
            }
          }
        : {}),
      ...(resolvedSelectRecordType
        ? {
            selectrecordtype: {
              requested: args.selectRecordType ?? args.fieldValues?.selectrecordtype,
              value: resolvedSelectRecordType.value,
              source: resolvedSelectRecordType.source,
              matched: resolvedSelectRecordType.matched
            }
          }
        : {})
    }
  };
};

const createScriptField = async (N, args = {}) => {
  const { runtime, url } = N;
  const scriptInternalId = String(
    args.scriptInternalId ?? args.scriptRecordId ?? args.parentScriptId ?? ""
  ).trim();
  if (!scriptInternalId) {
    throw new Error("scriptInternalId is required.");
  }

  const fieldValues = buildScriptFieldValues(args);
  if (!fieldValues.fieldtype) {
    throw new Error(
      "fieldType is required. Use the same values returned by GET_CUSTOM_RECORD_FIELD_TYPES."
    );
  }

  const existing = await findExistingScriptField(N, fieldValues);
  if (existing) {
    return {
      success: true,
      existed: true,
      id: existing.internalid ?? existing.InternalID,
      recordType: "scriptcustomfield",
      scripttype: scriptInternalId,
      existing,
      fieldValues,
      note: "A matching script field already exists; returning its ID instead of creating a duplicate."
    };
  }

  const requestedFieldType = fieldValues.fieldtype;
  let resolvedFieldType = normalizeCustomRecordFieldUiType(requestedFieldType);
  fieldValues.fieldtype = resolvedFieldType;

  const domain = url?.resolveDomain
    ? url.resolveDomain({ hostType: url.HostType.APPLICATION })
    : window.location.host;
  const scriptUrl = `https://${domain}/app/common/scripting/script.nl?id=${encodeURIComponent(
    scriptInternalId
  )}`;
  const { accountId, csrfToken } = window.getNetsiteParams();
  const currentUser = runtime?.getCurrentUser ? runtime.getCurrentUser() : {};
  const ownerId = String(currentUser.id ?? "");
  const ownerName = currentUser.name || "";
  const scriptId = fieldValues.scriptid;
  const fieldTypeText =
    CUSTOM_RECORD_FIELD_UI_LABELS[resolvedFieldType] || resolvedFieldType;
  const storeValue =
    fieldValues.storevalue === undefined
      ? "T"
      : fieldValues.storevalue
        ? "T"
        : "F";
  let selectRecordTypeFallbackNote = null;
  if (
    (resolvedFieldType === "SELECT" || resolvedFieldType === "MULTISELECT") &&
    (fieldValues.selectrecordtype === undefined ||
      fieldValues.selectrecordtype === null ||
      fieldValues.selectrecordtype === "")
  ) {
    selectRecordTypeFallbackNote =
      "fieldType was SELECT/MULTISELECT but no selectRecordType was provided; defaulted to TEXT.";
    resolvedFieldType = "TEXT";
    fieldValues.fieldtype = "TEXT";
  }

  const resolvedSelectRecordType =
    resolvedFieldType === "SELECT" || resolvedFieldType === "MULTISELECT"
      ? await resolveCustomFieldSelectRecordType(
          N,
          fieldValues.selectrecordtype
        )
      : null;
  if (resolvedSelectRecordType?.value) {
    fieldValues.selectrecordtype = resolvedSelectRecordType.value;
  }

  const params = new URLSearchParams({
    submitter: "Save",
    label: fieldValues.label ?? "",
    label_send: fieldValues.label ?? "",
    scriptid: scriptId ?? "",
    fieldid: scriptId ?? "",
    "nsutils-automated-ids": "on",
    inpt_owner: ownerName,
    owner: ownerId,
    description: fieldValues.description ?? "",
    inpt_fieldtype: fieldTypeText,
    fieldtype: resolvedFieldType,
    storevalue: storeValue,
    storevalue_send: storeValue,
    inpt_setting: " ",
    setting: "",
    _eml_nkey_: `${accountId}~${ownerId}~${currentUser.role ?? ""}~N`,
    _multibtnstate_: "",
    selectedtab: "DISPLAY",
    nsapiPI: "",
    nsapiSR: "",
    nsapiVF: "",
    nsapiFC: "",
    nsapiPS: "",
    nsapiVI: "",
    nsapiVD: "",
    nsapiPD: "",
    nsapiVL: "",
    nsapiRC: "",
    nsapiLI: "",
    nsapiLC: "",
    nsapiCT: Date.now().toString(),
    nsbrowserenv: "istop=T",
    type: "custscriptfield",
    id: "",
    externalid: "",
    whence: `/app/common/scripting/script.nl?id=${scriptInternalId}`,
    customwhence: "",
    entryformquerystring: `scripttype=${scriptInternalId}`,
    _csrf: csrfToken,
    originchannel: "",
    fldcurrenttype: resolvedFieldType,
    originalfieldtype: "",
    originalselectrecordtype: "",
    fldselectishierarchical: "F",
    fldselectislist: "",
    fldcurselrectype: "",
    fldcurrstored: "",
    showinlist: "F",
    inactive: "F",
    enabletextenhance: "F",
    insertbefore: "",
    subtab: "",
    fldtabsection: "",
    displaytype: "",
    fldsizelabel: "",
    displaywidth: "",
    displayheight: "",
    applyformatting: "T",
    isunformattedcurrency: "F",
    help: "",
    parentsubtab: "",
    linktext: "",
    showhierarchy: "F",
    ismandatory: "F",
    checkspelling: "F",
    maxlength: "",
    minvalue: "",
    maxvalue: "",
    defaultchecked: "F",
    defaultvalue: "",
    defaultvaluerte: "",
    isformula: "F",
    defaultselection: "",
    dynamicdefault: "",
    onparentdelete: "NO_ACTION",
    sourcelist: "",
    sourcefrom: "",
    sourcefilterby: "",
    sourcefromtype: "",
    sourcefromtypedisplay: "",
    sourcefromrecordtype: "",
    sourcefromrecordtypedisplay: "",
    sourcefilterbyrecordtype: "",
    sourcefilterbyrecordtypedisplay: "",
    sourcelistrecordtype: "",
    sourcelistrecordtypedisplay: "",
    sourcefilterreferencedbycount: "",
    staticfieldtype: "",
    staticlistrecordtype: "",
    usedassource: "",
    customsegment: "",
    scripttype: scriptInternalId,
    accesslevel: "2",
    searchlevel: "2",
    label_term_ref: "",
    colreflabel: "",
    help_term_ref: "",
    colrefhelp: "",
    aidescription: "",
    submitted: "T",
    formdisplayview: "NONE",
    _button: "",
    customfieldfilterfields:
      "fldfilter_display\x01fldfilter\x01fldfiltertype\x01fldfilterchecked\x01fldfiltercomparetype\x01fldfilterval\x01fldfiltersel_display\x01fldfiltersel\x01fldfiltersel_labels\x01fldfilternotnull\x01fldfilternull\x01fldcomparefield_display\x01fldcomparefield\x01fldselecttype",
    customfieldfilterflags:
      "8\x011\x010\x010\x010\x010\x018\x010\x01\x010\x010\x018\x010\x010",
    customfieldfilterfieldsets:
      "\x01\x01\x01\x01\x01\x01\x01\x01customfieldfilter.fldfilter\x01\x01\x01\x01\x01",
    customfieldfiltertypes:
      "text\x01integer\x01text\x01checkbox\x01select\x01text\x01textarea\x01slaveselect\x01text\x01checkbox\x01checkbox\x01text\x01slaveselect\x01integer",
    customfieldfilterorigtypes:
      "\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01",
    customfieldfilterparents:
      "selectrecordtype\x01selectrecordtype\x01customfieldfilter.fldfilter\x01\x01\x01\x01customfieldfilter.fldfilter\x01customfieldfilter.fldfilter\x01\x01\x01\x01customfieldfilter.fldfilter\x01customfieldfilter.fldfilter\x01",
    customfieldfilterlabels:
      "Filter Using\x01\x01\x01Is Checked\x01Compare Type\x01Compare Value to\x01Value Is\x01\x01\x01Is Not Empty\x01Is Empty\x01Compare to Field\x01\x01",
    customfieldfilterdata: "",
    nextcustomfieldfilteridx: "1",
    customfieldfiltervalid: "T",
    customfieldfilterloaded: "F",
    roleaccessfields: "role\x01accesslevel\x01searchlevel",
    roleaccessflags: "1\x011\x011",
    roleaccessfieldsets: "\x01\x01",
    roleaccesstypes: "select\x01select\x01select",
    roleaccessorigtypes: "\x01\x01",
    roleaccessparents: "\x01\x01",
    roleaccesslabels: "Role\x01Access Level\x01Level for Search/Reporting",
    roleaccessdata: "",
    nextroleaccessidx: "1",
    roleaccessvalid: "T",
    roleaccessloaded: "F",
    deptaccessfields: "dept\x01accesslevel\x01searchlevel",
    deptaccessflags: "1\x011\x011",
    deptaccessfieldsets: "\x01\x01",
    deptaccesstypes: "select\x01select\x01select",
    deptaccessorigtypes: "\x01\x01",
    deptaccessparents: "\x01\x01",
    deptaccesslabels:
      "Department\x01Access Level\x01Level for Search/Reporting",
    deptaccessdata: "",
    nextdeptaccessidx: "1",
    deptaccessvalid: "T",
    deptaccessloaded: "F",
    subaccessfields: "sub\x01accesslevel\x01searchlevel",
    subaccessflags: "1\x011\x011",
    subaccessfieldsets: "\x01\x01",
    subaccesstypes: "select\x01select\x01select",
    subaccessorigtypes: "\x01\x01",
    subaccessparents: "\x01\x01",
    subaccesslabels: "Subsidiary\x01Access Level\x01Level for Search/Reporting",
    subaccessdata: "",
    nextsubaccessidx: "1",
    subaccessvalid: "T",
    subaccessloaded: "F",
    translationsfields: "locale\x01language\x01label\x01help",
    translationsflags: "0\x010\x014\x014",
    translationsfieldsets: "\x01\x01\x01",
    translationstypes: "text\x01text\x01text\x01textarea",
    translationsorigtypes: "\x01\x01\x01",
    translationsparents: "\x01\x01\x01",
    translationslabels: "\x01Language\x01Label\x01Help",
    translationsdata:
      "en\x01English (International)\x01\x01\x02fr_FR\x01French (France)\x01\x01\x02de_DE\x01German\x01\x01\x02it_IT\x01Italian\x01\x01",
    nexttranslationsidx: "5",
    translationsvalid: "T",
    translationssortidx: "0",
    translationssorttype: "TEXT",
    translationssortdir: "UP",
    translationssortname: "language",
    translationssort2dir: "",
    translationssort2name: ""
  });

  if (fieldValues.selectrecordtype !== undefined) {
    setIfPresent(params, "selectrecordtype", fieldValues.selectrecordtype);
    setIfPresent(params, "fldcurselrectype", fieldValues.selectrecordtype);
    setIfPresent(params, "fldselectislist", "T");
    setIfPresent(params, "staticlistrecordtype", fieldValues.selectrecordtype);
  } else if (resolvedFieldType === "SELECT" || resolvedFieldType === "MULTISELECT") {
    throw new Error(
      "selectRecordType is required when fieldType is SELECT or MULTISELECT. " +
        "Call GET_CUSTOM_RECORD_SELECT_RECORD_TYPES and use a returned value."
    );
  }

  Object.entries(fieldValues).forEach(([fieldId, value]) => {
    if (
      value !== undefined &&
      ![
        "label",
        "scriptid",
        "description",
        "fieldtype",
        "storevalue"
      ].includes(fieldId)
    ) {
      setIfPresent(params, fieldId, value);
    }
  });

  const response = await fetch(
    `https://${domain}/app/common/custom/scriptcustfield.nl`,
    {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "it-IT,it;q=0.6",
        "cache-control": "max-age=0",
        "content-type": "application/x-www-form-urlencoded",
        priority: "u=0, i",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1"
      },
      referrer: `${scriptUrl}&e=T`,
      body: params.toString()
    }
  );

  const html = await response.text();
  if (!response.ok) {
    throw new Error(`Script field form save failed: HTTP ${response.status}`);
  }

  const formError = extractNetSuiteFormError(html);
  const id = extractScriptFieldIdFromHtml(html);
  if (!id && formError) {
    throw new Error(`Script field form save failed: ${formError}`);
  }
  if (!id) {
    throw new Error(
      `Script field form save completed but no field ID was found in the response. ${html
        .replace(/\s+/g, " ")
        .slice(0, 500)}`
    );
  }

  return {
    success: true,
    existed: false,
    id,
    recordType: "scriptcustomfield",
    scripttype: scriptInternalId,
    url: `https://${domain}/app/common/custom/scriptcustfield.nl?scripttype=${encodeURIComponent(
      scriptInternalId
    )}&e=T&id=${encodeURIComponent(id)}`,
    parentUrl: scriptUrl,
    fieldValues,
    resolved: {
      fieldtype: {
        requested: requestedFieldType,
        value: resolvedFieldType
      },
      ...(selectRecordTypeFallbackNote
        ? {
            selectrecordtypeFallback: {
              note: selectRecordTypeFallbackNote
            }
          }
        : {}),
      ...(resolvedSelectRecordType
        ? {
            selectrecordtype: {
              requested: args.selectRecordType ?? args.fieldValues?.selectrecordtype,
              value: resolvedSelectRecordType.value,
              source: resolvedSelectRecordType.source,
              matched: resolvedSelectRecordType.matched
            }
          }
        : {})
    }
  };
};

const findCustomRecordFieldToInspect = async (N, args = {}) => {
  if (args.customFieldId) {
    return { internalid: args.customFieldId };
  }

  const customRecordTypeId =
    args.customRecordTypeId ?? args.customRecordTypeInternalId;
  if (!customRecordTypeId) {
    throw new Error(
      "customFieldId or customRecordTypeId is required to inspect a custom record field."
    );
  }

  const conditions = [`RecordType = ${Number(customRecordTypeId)}`];
  if (args.scriptId) {
    const scriptId = getMetadataScriptId(
      normalizeMetadataScriptId(args.scriptId, "custrecord"),
      "CUSTRECORD"
    );
    conditions.push(`UPPER(ScriptID) = UPPER(${sqlLiteral(scriptId)})`);
  }

  const sql = `
SELECT
  InternalID,
  Name,
  ScriptID,
  RecordType
FROM
  CustomField
WHERE
  ${conditions.join(" AND ")}
  AND ROWNUM <= 1
`;

  const row = await firstSuiteQLRow(N, sql);
  if (!row) {
    throw new Error(
      `No custom field found for customRecordTypeId ${customRecordTypeId}.`
    );
  }

  return row;
};

const inspectCustomRecordField = async (N, args = {}) => {
  const { record } = N;
  const row = await findCustomRecordFieldToInspect(N, args);
  const customFieldId = row.internalid ?? row.InternalID ?? row.id;

  const customField = record.load({
    type: "customrecordcustomfield",
    id: customFieldId,
    isDynamic: true
  });

  const fieldIds = customField.getFields();
  const fields = fieldIds.map((fieldId) =>
    getRecordFieldSnapshot(customField, fieldId)
  );
  const byId = fields.reduce((acc, field) => {
    acc[field.fieldId] = field;
    return acc;
  }, {});

  return {
    success: true,
    recordType: "customrecordcustomfield",
    id: String(customFieldId),
    source: row,
    fieldCount: fieldIds.length,
    fields,
    byId,
    selectOptions: {
      fieldtype: getSelectOptions(customField, "fieldtype", "").map(
        (option) => ({
          value: option.value,
          text: option.text
        })
      ),
      selectrecordtype: getSelectOptions(
        customField,
        "selectrecordtype",
        ""
      ).map((option) => ({
        value: option.value,
        text: option.text
      }))
    }
  };
};

// Map of handlers keyed by action names
const handlers = {
  SCRIPTS: async ({ modules, payload: { scriptid } }) => {
    console.log("Scripts action received:", scriptid);
    return window.getScripts(modules, { scriptId: scriptid });
  },
  CUSTOM_RECORDS: async ({ modules }) => {
    console.log("Custom Records action received");
    return window.getCustomRecords(modules);
  },
  ADVANCED_PDF_TEMPLATES: async ({ modules }) => {
    console.log("Advanced PDF Templates action received");
    return window.getAdvancedPDFTemplates(modules);
  },
  GET_TEMPLATES_CONTENT: async ({ modules, payload }) => {
    console.log("Get Templates Content action received:", payload.templateId);
    return window.getAdvancedPDFTemplatesContent(modules, payload);
  },
  SAVE_TEMPLATE: async ({ modules, payload }) => {
    console.log("Save Templates Content action received:", payload.templateId);
    console.log("payload", payload);
    return window.savePdfTemplate(modules, payload);
  },
  PREVIEW: async ({ modules, payload }) => {
    console.log("Preview action received:", payload.templateId);
    return window.previewPdfTemplate(modules, payload);
  },
  SCRIPT_URL: async ({ modules, payload: { scriptId } }) => {
    console.log("Script URL action received:", scriptId);
    return window.getScriptUrl(modules, { scriptId });
  },
  CUSTOM_RECORD_URL: async ({ modules, payload: { recordId } }) => {
    console.log("Custom Record URL action received:", recordId);
    return window.getCustomRecordUrl(modules, { recordId });
  },
  CUSTOM_RECORD_LIST_URL: async ({ modules, payload: { recordId } }) => {
    console.log("Custom Record URL action received:", recordId);
    return window.getCustomRecordListUrl(modules, { recordId });
  },
  RUN_QUICK_SCRIPT: async ({ modules, payload: { code, requestId, mode } }) => {
    console.log("Run Quick Script action received", { mode });
    try {
      // Pass mode to runQuickScript
      const result = await window.runQuickScript(modules, { code, requestId, mode });

      // For streaming, don't return anything here - data flows through postMessage
      if (mode === "stream") {
        return null;
      }

      return result;
    } catch (err) {
      return {
        result: null,
        error: err?.message || String(err),
        logs: [
          { type: "error", values: ["Script execution error: " + (err?.message || String(err))] }
        ]
      };
    }
  },
  RUN_QUICK_SCRIPT_SERVER: async ({
    modules,
    payload: { code, userId },
    csrfToken
  }) => {
    console.log("Run Quick Script Server action received", { userId });

    return window.runQuickScriptServer(modules, { code, userId }, csrfToken);
  },
  RENDER_FREEMARKER_TEMPLATE: async ({
    modules,
    payload: { template, recordType, recordId },
    csrfToken
  }) => {
    console.log("Render FreeMarker Template action received");
    return window.renderFreemarkerTemplateServer(
      modules,
      { template, recordType, recordId },
      csrfToken
    );
  },
  CHECK_SERVER_COMPONENTS: async ({ modules, payload, csrfToken }) => {
    return window.checkMagicNetsuiteComponents(modules, {}, csrfToken);
  },
  REMOVE_SERVER_COMPONENTS: async ({ modules, payload, csrfToken }) => {
    console.log("Remove Server Components action received");
    return await window.removeMagicNetsuiteComponents(modules, {}, csrfToken);
  },
  SCRIPTS_DEPLOYED: async ({ modules, payload: { recordType } }) => {
    console.log("Scripts Deployed action received");
    return window.getDeployedScriptFiles(modules, { recordType });
  },
  SCRIPT_FILES: async ({ modules, payload: { scriptIds } }) => {
    console.log("Script Files action received", { scriptIds });
    return window.getScriptFiles(modules, { scriptIds });
  },
  CURRENT_REC_TYPE: async ({ modules }) => {
    console.log("Current Record Type action received");
    return window.getCurrentRecordIdType(modules);
  },
  CURRENT_USER: async ({ modules }) => {
    console.log("Current User action received");
    return window.getCurrentUser(modules);
  },
  EXPORT_RECORD: async ({ modules, payload: { config } }) => {
    console.log("Export Record action received");
    return window.exportRecord(modules, config);
  },
  CHECK_CONNECTION: async ({ modules }) => {
    if (modules) return "connected";
    return "disconnected";
  },
  CHECK_GOVERNANCE: async ({ modules }) => {
    try {
      const script = modules.runtime.getCurrentScript();
      const remaining = script.getRemainingUsage();
      return { remaining };
    } catch {
      // Not in a governance-tracked context — report as unknown
      return { remaining: -1 };
    }
  },
  AVAILABLE_MODULES: async ({ modules }) => {
    console.log("Available Modules action received");
    return Object.keys(modules);
  },
  SCRIPT_TYPES: async ({ modules }) => {
    console.log("Script Types action received");
    return window.getScriptTypes(modules);
  },
  SCRIPT_DEPLOYMENTS: async ({ modules, payload: { scriptId, scriptIds } }) => {
    console.log("Script Deployments action received", { scriptId, scriptIds });
    return window.getDeployments(modules, { scriptId, scriptIds });
  },
  SCRIPT_DEPLOYMENT_URL: async ({ modules, payload: { deployment } }) => {
    console.log("Script Deployment URL action received");
    return window.getScriptDeploymentUrl(modules, { deployment });
  },
  EXECUTE_SCRIPT_DEPLOYMENT: async ({
    modules,
    payload: {
      scriptId,
      scriptName,
      scriptType,
      scriptInternalId,
      deploymentScriptId,
      deploymentNumber,
      status,
      logLevel,
      isDeployed,
      deploymentRecordId
    }
  }) => {
    console.log("Execute Script Deployment action received", {
      scriptId,
      scriptType,
      scriptInternalId,
      deploymentScriptId,
      deploymentRecordId
    });
    return window.executeScriptDeployment(modules, {
      scriptId,
      scriptName,
      scriptType,
      scriptInternalId,
      deploymentScriptId,
      deploymentNumber,
      status,
      logLevel,
      isDeployed,
      deploymentRecordId
    });
  },
  SUITELET_URL: async ({
    modules,
    payload: { script, deployment, returnExternalUrl = false, iframe = false }
  }) => {
    console.log("Open Suitelet action received");
    return window.getSuiteletUrl(modules, {
      script,
      deployment,
      returnExternalUrl,
      iframe
    });
  },
  OPEN_DEPLOYMENT_SUITELET: async ({
    modules,
    payload: { script, deployment, returnExternalUrl = false, iframe = false }
  }) => {
    console.log("Open Deployment Suitelet action received", {
      script,
      deployment
    });
    return window.getSuiteletUrl(modules, {
      script,
      deployment,
      returnExternalUrl,
      iframe
    });
  },
  LOGS: async ({
    modules,
    payload: { startDate, endDate, scriptIds, deploymentIds, scriptTypes }
  }) => {
    console.log("Logs action received", { startDate, endDate });

    startDate = startDate ? new Date(startDate) : null;
    endDate = endDate ? new Date(endDate) : null;

    return window.getLogsByTime(modules, {
      startDate,
      endDate,
      scriptIds,
      deploymentIds,
      scriptTypes
    });
  },
  CLEAR_SCRIPT_LOGS: async ({
    modules,
    payload: { scriptId, deploymentNumber, deploymentRecordId }
  }) => {
    console.log("Clear Script Logs action received", {
      scriptId,
      deploymentNumber,
      deploymentRecordId
    });
    return window.clearScriptExecutionLogs(modules, {
      scriptId,
      deploymentNumber,
      deploymentRecordId
    });
  },
  ROOT_FOLDERS: async ({ modules }) => {
    console.log("Root Folders action received");
    return window.getRootFolders(modules);
  },
  CREATE_FOLDER: async ({
    modules,
    payload: { name, parentFolder },
    csrfToken
  }) => {
    console.log("Create Folder action received");

    return await window.createFolder(modules, {
      folderName: name,
      parentFolderId: parentFolder,
      csrfToken
    });
  },
  UPLOAD_FILE: async ({
    modules,
    payload: { fileName, fileContent, fileContentBase64, mimeType, folderId },
    csrfToken
  }) => {
    console.log("Upload File action received", { fileName, folderId });

    return await window.uploadFile(modules, {
      fileName,
      fileContent,
      fileContentBase64,
      mimeType,
      folderId: folderId ?? -15,
      csrfToken
    });
  },
  CREATE_SCRIPT: async ({
    modules,
    payload: { name, scriptId, fileId, scriptType, description, apiVersion },
    csrfToken
  }) => {
    console.log("Create Script action received", {
      name,
      scriptId,
      fileId,
      scriptType
    });
    return await window.createScriptRecord(
      modules,
      { name, scriptId, fileId, scriptType, description, apiVersion },
      csrfToken
    );
  },
  CREATE_SCRIPT_DEPLOYMENT: async ({ modules, payload }) => {
    console.log("Create Script Deployment action received", payload);
    return await window.createScriptDeployRecord(modules, payload);
  },
  GET_ALL_RECORD_TYPES: async ({ modules }) => {
    console.log("Get All Record Types action received");
    const { record, query } = modules;
    return window.getAllRecordTypes({ record, query });
  },
  PING: async ({ modules, payload: { delay } }) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ pong: true, delay });
      }, delay);
    });
  },
  FETCH_SUITEQL_TABLES: async () => {
    console.log("Fetch SuiteQL Tables action received");
    return window.fetchSuiteQLTables();
  },
  FETCH_SUITEQL_TABLE_DETAIL: async ({ payload: { tableName } }) => {
    console.log("Fetch SuiteQL Table Detail action received:", tableName);
    return window.fetchSuiteQLTableDetail(tableName);
  },
  RUN_SUITEQL_QUERY: async ({ modules, payload: { sql, limit } }) => {
    console.log("Run SuiteQL Query action received", { limit });
    return window.runSuiteQLQuery(modules, sql, limit ?? 1000);
  },
  GET_SUITEQL_COUNT: async ({ modules, payload: { sql } }) => {
    console.log("Get SuiteQL Count action received");
    return window.getSuiteQLCount(modules, sql);
  },
  FETCH_FILE_CONTENT: async ({ payload: { fileUrl } }) => {
    console.log("Fetch File Content action received", { fileUrl });
    const fullUrl = window.location.origin + fileUrl;
    const response = await fetch(fullUrl, { credentials: "include" });
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const contentType = response.headers.get("content-type") || "";
    const isText = /text|javascript|json|xml|css|html|svg|freemarker|csv/i.test(
      contentType
    );
    if (isText) {
      const text = await response.text();
      return { content: text, contentType, binary: false };
    }
    // Binary files: return as base64 data URL
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const dataUrl = `data:${contentType};base64,${base64}`;
    return { content: dataUrl, contentType, binary: true };
  },
  UPDATE_FILE_CONTENT: async ({
    modules,
    payload: { fileId, fileContent, fileName, folderId, mediaType }
  }) => {
    console.log("Update File Content action received", { fileId, fileName });
    return window.updateNetsuiteFileContent(modules, {
      fileId,
      fileContent,
      fileName,
      folderId,
      mediaType: mediaType || "JAVASCRIPT"
    });
  },
  DELETE_FILE: async ({ modules, payload: { fileId, folderId } }) => {
    console.log("Delete File action received", { fileId, folderId });
    return await window.deleteNetsuiteFile(modules, { fileId, folderId });
  },
  DELETE_FOLDER: async ({ modules, payload: { folderId } }) => {
    console.log("Delete Folder action received", { folderId });
    return await window.deleteFolder(modules, { folderId });
  },
  RENAME_FILE: async ({
    modules,
    payload: { fileId, newName, folderId, filetype, filesize }
  }) => {
    console.log("Rename File action received", { fileId, newName });
    return await window.editMediaItem(modules, {
      fileId,
      newName,
      folderId,
      filetype,
      filesize
    });
  },
  RENAME_FOLDER: async ({
    modules,
    payload: { folderId, newName, parentFolderId }
  }) => {
    console.log("Rename Folder action received", { folderId, newName });
    return await window.editFolder(modules, {
      folderId,
      newName,
      parentFolderId
    });
  },
  MOVE_ITEMS: async ({
    modules,
    payload: { srcFolderId, dstFolderId, fileIds, folderIds }
  }) => {
    console.log("Move Items action received", {
      srcFolderId,
      dstFolderId,
      fileIds,
      folderIds
    });
    return await window.moveItems(modules, {
      srcFolderId,
      dstFolderId,
      fileIds: fileIds ?? [],
      folderIds: folderIds ?? []
    });
  },
  EXECUTE_HTTP_REQUEST: async ({ payload: { method, url, headers, body } }) => {
    console.log("Execute HTTP Request action received", { method, url });
    return await window.executeHttpRequest(null, {
      method,
      url,
      headers: headers ?? {},
      body
    });
  },
  LOAD_RECORD: async ({ modules, payload: { type, id } }) => {
    console.log("Load Record (body only) action received", { type, id });
    return window.loadRecordById(modules, { type, id, bodyOnly: true });
  },
  LOAD_RECORD_JSON: async ({
    modules,
    payload: { type, id, includeSublists }
  }) => {
    console.log("Load Record (toJSON) action received", {
      type,
      id,
      includeSublists
    });
    return window.loadRecordByIdToJson(modules, {
      type,
      id,
      includeSublists: includeSublists !== false
    });
  },
  LOAD_RECORD_SUBLISTS: async ({
    modules,
    payload: { type, id, sublistIds }
  }) => {
    console.log("Load Record Sublists action received", {
      type,
      id,
      sublistIds
    });
    return window.loadRecordSublists(modules, {
      type,
      id,
      sublistIds: sublistIds ?? null
    });
  },
  GET_RECORD_FIELDS: async ({ modules, payload: { type } }) => {
    console.log("Get Record Fields action received", { type });
    return window.getRecordFields(modules, { type });
  },
  GET_RECORD_FIELD_TYPES: async ({ modules, payload: { type, fieldIds } }) => {
    console.log("Get Record Field Types action received", { type, fieldIds });
    return window.getRecordFieldTypes(modules, { type, fieldIds });
  },
  GET_CUSTOM_LISTS: async ({ modules, payload }) => {
    console.log("Get Custom Lists action received", payload);
    return window.getCustomLists(modules, payload);
  },
  GET_CUSTOM_LIST_ITEMS: async ({ modules, payload }) => {
    console.log("Get Custom List Items action received", payload);
    return window.getCustomListItems(modules, payload);
  },
  CREATE_RECORD: async ({ modules, payload }) => {
    console.log("Create Record action received", payload);
    return createRecord(modules, payload);
  },
  UPDATE_RECORD_FIELDS: async ({ modules, payload }) => {
    console.log("Update Record Fields action received", payload);
    return updateRecordFields(modules, payload);
  },
  CREATE_CUSTOM_RECORD_TYPE: async ({ modules, payload }) => {
    console.log("Create Custom Record Type action received");
    return createCustomRecordType(modules, payload);
  },
  GET_CUSTOM_RECORD_FIELD_TYPES: async ({ modules, payload }) => {
    console.log("Get Custom Record Field Types action received", payload);
    return getCustomRecordFieldTypes(modules, payload);
  },
  GET_CUSTOM_RECORD_SELECT_RECORD_TYPES: async ({ modules, payload }) => {
    console.log("Get Custom Record Select Record Types action received", payload);
    return getCustomRecordSelectRecordTypeOptions(modules, payload);
  },
  INSPECT_CUSTOM_RECORD_FIELD: async ({ modules, payload }) => {
    console.log("Inspect Custom Record Field action received", payload);
    return inspectCustomRecordField(modules, payload);
  },
  CREATE_CUSTOM_RECORD_FIELD: async ({ modules, payload }) => {
    console.log("Create Custom Record Field action received");
    return createCustomRecordField(modules, payload);
  },
  CREATE_SCRIPT_FIELD: async ({ modules, payload }) => {
    console.log("Create Script Field action received");
    return createScriptField(modules, payload);
  },
  FIND_FOLDER: async ({ modules, payload: { id, name } }) => {
    console.log("Find Folder action received", { id, name });
    if (!id && !name)
      throw new Error("At least one of 'id' or 'name' is required.");
    const conditions = [];
    if (id) conditions.push(`id = ${parseInt(id, 10)}`);
    if (name)
      conditions.push(
        `LOWER(name) LIKE LOWER('%${String(name).replace(/'/g, "''")}%')`
      );
    const whereClause =
      conditions.length === 1 ? conditions[0] : `(${conditions.join(" OR ")})`;
    const sql = `SELECT id, name, parent FROM MediaItemFolder WHERE ${whereClause} AND ROWNUM <= 25`;
    const folders = await window.runSuiteQLQuery(modules, sql, 25);
    return { count: folders.length, folders };
  },
  FIND_FILE: async ({ modules, payload: { id, name } }) => {
    console.log("Find File action received", { id, name });
    if (!id && !name)
      throw new Error("At least one of 'id' or 'name' is required.");
    const conditions = [];
    if (id) conditions.push(`id = ${parseInt(id, 10)}`);
    if (name)
      conditions.push(
        `LOWER(name) LIKE LOWER('%${String(name).replace(/'/g, "''")}%')`
      );
    const whereClause =
      conditions.length === 1 ? conditions[0] : `(${conditions.join(" OR ")})`;
    const sql = `SELECT id, name, folder, filesize, filetype, url FROM file WHERE ${whereClause} AND ROWNUM <= 25`;
    const files = await window.runSuiteQLQuery(modules, sql, 25);
    const results = Array.isArray(files) ? files : (files?.results ?? []);
    const totalCount = Array.isArray(files)
      ? results.length
      : (files?.totalCount ?? results.length);
    return {
      count: totalCount,
      files,
      ...(id && !name && totalCount === 0
        ? {
            hint: "No File Cabinet file has that internal ID. If this number came from a lead/customer/entity/transaction request, it is a record ID; use SuiteQL relationship discovery to find the linked file ID."
          }
        : {})
    };
  },
  LIST_FOLDER: async ({ modules, payload: { folderId } }) => {
    console.log("List Folder action received", { folderId });
    const idNum = parseInt(String(folderId ?? ""), 10);
    if (isNaN(idNum)) throw new Error("folderId must be a numeric folder ID.");
    const [subfolders, files] = await Promise.all([
      window.runSuiteQLQuery(
        modules,
        `SELECT id, name FROM MediaItemFolder WHERE parent = ${idNum} AND ROWNUM <= 200`,
        200
      ),
      window.runSuiteQLQuery(
        modules,
        `SELECT id, name, filesize, filetype, url FROM file WHERE folder = ${idNum} AND ROWNUM <= 200`,
        200
      )
    ]);
    return {
      folderId: idNum,
      subfolderCount: subfolders.length,
      fileCount: files.length,
      subfolders,
      files
    };
  },
  FETCH_ACCOUNTS: async () => {
    console.log("Fetch Accounts action received");
    try {
      // Extract account ID from current domain (e.g., "1964539" from "1964539.app.netsuite.com")
      const getCurrentAccountIdFromDomain = () => {
        const hostname = window.location.hostname;
        const parts = hostname.split(".");
        // Expected format: [accountId].app.netsuite.com
        if (
          parts.length >= 4 &&
          parts[1] === "app" &&
          parts[2] === "netsuite" &&
          parts[3] === "com"
        ) {
          return parts[0];
        }
        return parts[0]; // Fallback to first segment
      };
      const accountId = getCurrentAccountIdFromDomain();
      const url = `https://${accountId}.app.netsuite.com/app/login/secure/myroles/myroles.nl?whence=`;
      const response = await fetch(url, {
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "it-IT,it;q=0.6",
          "cache-control": "max-age=0",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "same-origin",
          "upgrade-insecure-requests": "1"
        },
        credentials: "include"
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const scripts = doc.querySelectorAll("script");
      for (const script of scripts) {
        const content = script.textContent;
        if (!content.includes("allAccounts")) continue;
        try {
          const data = JSON.parse(content);
          const findContainer = (obj) => {
            if (!obj || typeof obj !== "object") return null;
            for (const key of Object.keys(obj)) {
              if (key.trim() === "allAccounts" && Array.isArray(obj[key]))
                return obj;
            }
            for (const key of Object.keys(obj)) {
              const result = findContainer(obj[key]);
              if (result) return result;
            }
            return null;
          };
          const container = findContainer(data);
          if (!container) continue;
          const getVal = (obj, key) =>
            obj[key] || obj[` ${key}`] || obj[`  ${key}`];

          const currentAccount = container["account"] || container[" account"];
          const allAccounts = getVal(container, "allAccounts") || [];
          const allRoles = getVal(container, "allRoles") || [];
          const accounts = [];
          // Add current account first
          if (currentAccount) {
            accounts.push({
              id: (getVal(currentAccount, "accountId") || "").trim(),
              name: (getVal(currentAccount, "accountName") || "").trim(),
              type: (getVal(currentAccount, "accountType") || "").trim(),
              isCurrent: true
            });
          }
          // Add all other accounts
          allAccounts.forEach((acc) => {
            accounts.push({
              id: (getVal(acc, "accountId") || "").trim(),
              name: (getVal(acc, "accountName") || "").trim(),
              type: (getVal(acc, "accountType") || "").trim(),
              isCurrent: false
            });
          });
          return {
            accounts,
            roles: allRoles.map((r) => ({
              id: r?.entityRoleId?.rol || r?.["entityRoleId"]?.["rol"],
              name: (getVal(r, "roleName") || "").trim()
            }))
          };
        } catch (e) {
          // JSON parse failed for this script tag, continue
        }
      }
      return { accounts: [], roles: [] };
    } catch (error) {
      console.error("Fetch accounts failed:", error);
      return { accounts: [], roles: [], error: error.message };
    }
  }
};
