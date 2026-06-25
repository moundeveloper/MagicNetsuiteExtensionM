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
  const forms = Array.from(doc.querySelectorAll("form"));
  const form =
    forms.find(
      (candidate) =>
        candidate.querySelector('[name="_csrf"]') &&
        candidate.querySelector('[name="fieldtype"]') &&
        candidate.querySelector('[name="id"]')
    ) ||
    forms.find((candidate) => candidate.querySelector('[name="_csrf"]')) ||
    forms[0] ||
    doc;
  const params = new URLSearchParams();
  const controls = Array.from(doc.querySelectorAll("input, select, textarea")).filter(
    (element) => form === doc || element.form === form || form.contains(element)
  );

  controls.forEach((element) => {
    const name = element.getAttribute("name");
    if (!name || element.disabled) return;

    const tagName = element.tagName.toLowerCase();
    const type = (element.getAttribute("type") || "").toLowerCase();

    if (["button", "submit", "reset", "image"].includes(type)) {
      return;
    }

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

const toNetSuiteBooleanFlag = (value, defaultValue = "F") => {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (value === true || value === "T") return "T";
  if (value === false || value === "F") return "F";
  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "1", "on"].includes(normalized)) return "T";
  if (["false", "no", "0", "off"].includes(normalized)) return "F";
  return value ? "T" : "F";
};

const normalizeNetSuiteCheckboxParams = (params, fieldIds = []) => {
  fieldIds.forEach((fieldId) => {
    if (params.has(fieldId)) {
      params.set(fieldId, toNetSuiteBooleanFlag(params.get(fieldId)));
    } else {
      params.set(fieldId, "F");
    }
  });
};

const CUSTOM_FIELD_EDIT_CHECKBOX_FIELDS = [
  "showinlist",
  "fldselectishierarchical",
  "applyformatting",
  "isunformattedcurrency",
  "showhierarchy",
  "ismandatory",
  "checkspelling",
  "defaultchecked",
  "isformula",
  "usedassource",
  "allowquickadd",
  "securityhistoryloaded",
  "securityhistorydotted",
  "historyloaded",
  "historydotted",
  "systemnotesloaded",
  "systemnotesdotted"
];
const encodeNetSuiteFormComponent = (value) =>
  encodeURIComponent(String(value ?? ""))
    .replace(/%20/g, "+")
    .replace(/[!'()~]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );

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

const extractCustomListIdFromHtml = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const idInput = doc.querySelector('input[name="id"]');
  if (idInput && /^\d+$/.test(idInput.value)) return idInput.value;
  const urlMatch = html.match(/custlist\.nl\?[^"'<>]*[?&]id=(\d+)/i);
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

const extractNetSuiteErrorPageText = (html, maxLength = 1200) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = doc.querySelector("title")?.textContent?.trim();
  const bodyText = doc.body?.textContent?.replace(/\s+/g, " ").trim();
  const text = [title, bodyText].filter(Boolean).join(": ");
  return (text || html.replace(/\s+/g, " ").trim()).slice(0, maxLength);
};

const buildCustomRecordTypeValues = (args = {}) => {
  const values = {
    ...(args.name !== undefined ? { recordname: args.name } : {}),
    ...(args.scriptId !== undefined ? { scriptid: args.scriptId } : {}),
    ...(args.description !== undefined
      ? { description: args.description }
      : {}),
    includename: args.includeNameField === true || args.includeName === true,
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

const buildCustomListValues = (args = {}) => {
  const values = {
    ...(args.name !== undefined ? { name: args.name } : {}),
    ...(args.scriptId !== undefined ? { scriptid: args.scriptId } : {}),
    ...(args.description !== undefined ? { description: args.description } : {}),
    ...(args.isOrdered !== undefined ? { isordered: args.isOrdered } : {}),
    ...(args.isHierarchical !== undefined ? { hierarchical: args.isHierarchical } : {}),
    ...(args.listFields && typeof args.listFields === "object" ? args.listFields : {})
  };
  if (values.scriptid !== undefined) {
    values.scriptid = normalizeMetadataScriptId(values.scriptid, "customlist");
  }
  return values;
};

const CUSTOM_LIST_VALUE_FIELDS = [
  "scriptid",
  "value",
  "value_term_ref",
  "value_translations",
  "value_sname_en",
  "value_sname_fr_FR",
  "value_sname_de_DE",
  "value_sname_it_IT",
  "valueid",
  "abbreviation",
  "isinactive",
  "parent"
];

const parseCustomListSublistData = (data = "") => {
  if (!data) return [];
  return String(data).split("\x02").filter(Boolean).map((row) => {
    const cols = row.split("\x01");
    const item = {};
    CUSTOM_LIST_VALUE_FIELDS.forEach((fieldId, index) => {
      item[fieldId] = cols[index] ?? "";
    });
    return item;
  });
};

const serializeCustomListSublistRows = (rows = []) => {
  return rows.map((row) => CUSTOM_LIST_VALUE_FIELDS.map((fieldId) => row[fieldId] ?? "").join("\x01")).join("\x02");
};

const normalizeCustomListValueRow = (line, index, existing = null) => {
  const tempId = "temp" + Date.now() + index;
  const source = typeof line === "string" ? { value: line } : (line ?? {});
  const valueId =
    source.internalId ??
    source.valueid ??
    source.id ??
    existing?.valueid ??
    "";
  const displayValue =
    source.value ??
    source.name ??
    source.label ??
    source.display ??
    existing?.value ??
    "";

  return {
    scriptid: existing?.scriptid ?? (source.scriptId !== undefined && source.scriptId !== null ? normalizeMetadataScriptId(source.scriptId, "customlist") : ""),
    value: displayValue,
    value_term_ref: source.valueTermRef ?? source.value_term_ref ?? existing?.value_term_ref ?? "",
    value_translations: source.valueTranslations ?? source.value_translations ?? existing?.value_translations ?? "",
    value_sname_en: source.value_sname_en ?? existing?.value_sname_en ?? "",
    value_sname_fr_FR: source.value_sname_fr_FR ?? existing?.value_sname_fr_FR ?? "",
    value_sname_de_DE: source.value_sname_de_DE ?? existing?.value_sname_de_DE ?? "",
    value_sname_it_IT: source.value_sname_it_IT ?? existing?.value_sname_it_IT ?? "",
    valueid: valueId,
    abbreviation: source.abbreviation ?? source.valueId ?? existing?.abbreviation ?? "",
    isinactive: source.isInactive === true || source.inactive === true ? "T" : source.isInactive === false || source.inactive === false ? "F" : existing?.isinactive ?? "F",
    parent: source.parent ?? existing?.parent ?? tempId
  };
};

const findCustomListExistingRow = (rows, line) => {
  if (typeof line === "string") {
    return rows.find((row) => row.value === line) ?? null;
  }

  const internalId = line?.internalId ?? line?.valueid ?? line?.id;
  if (internalId !== undefined && internalId !== null && internalId !== "") {
    const byId = rows.find((row) => String(row.valueid) === String(internalId));
    if (byId) return byId;
  }

  const originalValue =
    line?.currentValue ??
    line?.oldValue ??
    line?.originalValue ??
    line?.previousValue ??
    line?.from;
  if (originalValue !== undefined && originalValue !== null && originalValue !== "") {
    const byOriginalValue = rows.find((row) => row.value === String(originalValue));
    if (byOriginalValue) return byOriginalValue;
  }

  const value = line?.value ?? line?.name ?? line?.label ?? line?.display;
  if (value !== undefined && value !== null && value !== "") {
    const byValue = rows.find((row) => row.value === String(value));
    if (byValue) return byValue;
  }
  return null;
};

const mergeCustomListSublistRows = (currentData, values = [], replaceValues = false) => {
  const existingRows = parseCustomListSublistData(currentData);
  if (replaceValues) {
    return values.map((line, index) => normalizeCustomListValueRow(line, index, findCustomListExistingRow(existingRows, line)));
  }

  const rows = existingRows.map((row) => ({ ...row }));
  values.forEach((line, index) => {
    const existing = findCustomListExistingRow(rows, line);
    const normalized = normalizeCustomListValueRow(line, rows.length + index, existing);
    if (existing) {
      const rowIndex = rows.indexOf(existing);
      rows[rowIndex] = normalized;
    } else {
      rows.push(normalized);
    }
  });
  return rows;
};

const applyCustomListValueOperations = (currentData, args = {}) => {
  let rows = parseCustomListSublistData(currentData).map((row) => ({ ...row }));
  const summary = {
    mode: "preserve",
    added: 0,
    updated: 0,
    skippedExisting: [],
    notFound: []
  };

  const replaceAllValues = args.replaceAllValues ?? args.setValues;
  if (Array.isArray(replaceAllValues)) {
    rows = replaceAllValues.map((line, index) =>
      normalizeCustomListValueRow(line, index, findCustomListExistingRow(rows, line))
    );
    summary.mode = "replaceAllValues";
    summary.updated = rows.length;
    return { rows, summary };
  }

  if (Array.isArray(args.values ?? args.listValues)) {
    rows = mergeCustomListSublistRows(
      serializeCustomListSublistRows(rows),
      args.values ?? args.listValues,
      args.replaceValues === true
    );
    summary.mode = args.replaceValues === true ? "legacyReplaceValues" : "legacyUpsertValues";
    summary.updated = rows.length;
    return { rows, summary };
  }

  const valuesToAdd = args.valuesToAdd ?? args.addValues;
  if (Array.isArray(valuesToAdd)) {
    valuesToAdd.forEach((line, index) => {
      const existing = findCustomListExistingRow(rows, line);
      if (existing) {
        summary.skippedExisting.push(existing.value);
        return;
      }
      rows.push(normalizeCustomListValueRow(line, rows.length + index, null));
      summary.added += 1;
    });
  }

  const valuesToUpdate = args.valuesToUpdate ?? args.updateValues;
  if (Array.isArray(valuesToUpdate)) {
    valuesToUpdate.forEach((line, index) => {
      const existing = findCustomListExistingRow(rows, line);
      if (!existing) {
        summary.notFound.push(typeof line === "string" ? line : (line?.currentValue ?? line?.oldValue ?? line?.value ?? line?.id ?? ""));
        return;
      }
      const rowIndex = rows.indexOf(existing);
      rows[rowIndex] = normalizeCustomListValueRow(line, rows.length + index, existing);
      summary.updated += 1;
    });
  }

  if (summary.added || summary.updated) {
    summary.mode = "valueOperations";
  }
  return { rows, summary };
};

const normalizeCustomListLine = (line, index) => {
  const tempId = "temp" + Date.now() + index;
  if (typeof line === "string") {
    return { value: line, abbreviation: "", isInactive: false, scriptId: "", valueId: "", parent: tempId };
  }
  return {
    value: line?.value ?? line?.name ?? line?.label ?? "",
    abbreviation: line?.abbreviation ?? line?.valueId ?? "",
    isInactive: line?.isInactive === true || line?.inactive === true,
    scriptId: line?.scriptId !== undefined && line?.scriptId !== null ? normalizeMetadataScriptId(line.scriptId, "customlist") : "",
    valueId: line?.internalId ?? line?.valueid ?? "",
    parent: line?.parent ?? tempId
  };
};

const buildCustomListSublistData = (listValues = []) => {
  return listValues.map((line, index) => {
    const value = normalizeCustomListLine(line, index);
    return [
      value.scriptId,
      value.value,
      "",
      "",
      "",
      "",
      "",
      "",
      value.valueId,
      value.abbreviation,
      value.isInactive ? "T" : "F",
      value.parent
    ].join("\x01");
  }).join("\x02");
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

const findExistingCustomList = async (N, listValues) => {
  const conditions = [];
  const expectedScriptId = getMetadataScriptId(listValues.scriptid, "CUSTOMLIST");
  if (expectedScriptId) {
    conditions.push("UPPER(ScriptID) = UPPER(" + sqlLiteral(expectedScriptId) + ")");
  }
  if (listValues.name) {
    conditions.push("UPPER(Name) = UPPER(" + sqlLiteral(listValues.name) + ")");
  }
  if (conditions.length === 0) return null;
  const sql = [
    "SELECT InternalID, Name, ScriptID",
    "FROM CustomList",
    "WHERE (" + conditions.join(" OR ") + ")",
    "AND ROWNUM <= 1"
  ].join("\n");
  try {
    return await firstSuiteQLRow(N, sql);
  } catch (err) {
    console.warn("[createCustomList] Existing list lookup failed:", err);
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

const createCustomList = async (N, args = {}) => {
  const { runtime, url } = N;
  const listValues = buildCustomListValues(args);
  if (!listValues.name) throw new Error("name is required.");
  if (!listValues.scriptid) throw new Error("scriptId is required.");
  const values = Array.isArray(args.values ?? args.listValues) ? args.values ?? args.listValues : [];
  if (values.length === 0) throw new Error("values must contain at least one custom list value.");

  const existing = await findExistingCustomList(N, listValues);
  if (existing) {
    return {
      success: true,
      existed: true,
      id: existing.internalid ?? existing.InternalID,
      recordType: "customlist",
      existing,
      listValues,
      note: "A matching custom list already exists; returning its ID instead of creating a duplicate."
    };
  }

  const domain = url?.resolveDomain ? url.resolveDomain({ hostType: url.HostType.APPLICATION }) : window.location.host;
  const { accountId, csrfToken } = window.getNetsiteParams();
  const currentUser = runtime?.getCurrentUser ? runtime.getCurrentUser() : {};
  const ownerId = String(currentUser.id ?? "");
  const ownerName = currentUser.name || "";
  const isOrdered = listValues.isordered === false ? "F" : "T";
  const isHierarchical = listValues.hierarchical === true ? "T" : "F";

  const params = new URLSearchParams({
    submitter: "Save",
    name: listValues.name,
    name_send: "",
    package: "",
    scriptid: listValues.scriptid,
    "nsutils-automated-ids": "on",
    inpt_owner: ownerName,
    owner: ownerId,
    description: listValues.description ?? "",
    isordered: isOrdered,
    _eml_nkey_: accountId + "~" + ownerId + "~" + (currentUser.role ?? "") + "~N",
    _multibtnstate_: "",
    selectedtab: "",
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
    type: "custlist",
    id: "",
    externalid: "",
    whence: "",
    customwhence: "",
    entryformquerystring: "",
    _csrf: csrfToken,
    hierarchical: isHierarchical,
    target: "",
    name_term_ref: "",
    colrefname: "",
    submitted: "T",
    formdisplayview: "NONE",
    _button: "",
    customvaluefields: "scriptid\x01value\x01value_term_ref\x01value_translations\x01value_sname_en\x01value_sname_fr_FR\x01value_sname_de_DE\x01value_sname_it_IT\x01valueid\x01abbreviation\x01isinactive\x01parent",
    customvalueflags: "0\x011\x010\x010\x010\x010\x010\x010\x010\x010\x010\x010",
    customvaluefieldsets: "\x01\x01\x01\x01value_translations\x01value_translations\x01value_translations\x01value_translations\x01\x01\x01\x01",
    customvaluetypes: "identifier\x01text\x01text\x01fieldset\x01text\x01text\x01text\x01text\x01integer\x01text\x01checkbox\x01text",
    customvalueorigtypes: "\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01select",
    customvalueparents: "\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01",
    customvaluelabels: "\x01Value\x01\x01Translation\x01English (International)\x01French (France)\x01German\x01Italian\x01Internal ID\x01\x01Inactive\x01",
    customvaluedata: buildCustomListSublistData(values),
    nextcustomvalueidx: String(values.length + 1),
    customvaluevalid: "T",
    translationsfields: "locale\x01localedescription\x01name",
    translationsflags: "0\x010\x014",
    translationsfieldsets: "\x01\x01",
    translationstypes: "text\x01text\x01text",
    translationsorigtypes: "\x01\x01",
    translationsparents: "\x01\x01",
    translationslabels: "\x01Language\x01Translation",
    translationsdata: "en\x01English (International)\x01\x02fr_FR\x01French (France)\x01\x02de_DE\x01German\x01\x02it_IT\x01Italian\x01",
    nexttranslationsidx: "5",
    translationsvalid: "T",
    translationssortidx: "0",
    translationssorttype: "TEXT",
    translationssortdir: "UP",
    translationssortname: "localedescription",
    translationssort2dir: "",
    translationssort2name: ""
  });

  Object.entries(listValues).forEach(([fieldId, value]) => {
    if (value !== undefined && !["name", "scriptid", "description", "isordered", "hierarchical"].includes(fieldId)) {
      setIfPresent(params, fieldId, value);
    }
  });

  const response = await fetch("https://" + domain + "/app/common/custom/custlist.nl", {
    method: "POST",
    mode: "cors",
    credentials: "include",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
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
    referrer: "https://" + domain + "/app/common/custom/custlist.nl?whence=",
    body: params.toString()
  });

  const html = await response.text();
  if (!response.ok) throw new Error("Custom list form save failed: HTTP " + response.status);
  const formError = extractNetSuiteFormError(html);
  const id = extractCustomListIdFromHtml(html);
  if (!id && formError) throw new Error("Custom list form save failed: " + formError);
  if (!id) {
    throw new Error("Custom list form save completed but no list ID was found in the response. " + html.replace(/\s+/g, " ").slice(0, 500));
  }

  return {
    success: true,
    existed: false,
    id,
    recordType: "customlist",
    url: "https://" + domain + "/app/common/custom/custlist.nl?id=" + encodeURIComponent(id),
    listValues,
    valueCount: values.length
  };
};

const updateCustomList = async (N, args = {}) => {
  const { runtime, url } = N;
  const listId = String(args.listId ?? args.id ?? "").trim();
  if (!listId) throw new Error("listId is required.");

  const domain = url?.resolveDomain ? url.resolveDomain({ hostType: url.HostType.APPLICATION }) : window.location.host;
  const editUrl = "https://" + domain + "/app/common/custom/custlist.nl?id=" + encodeURIComponent(listId) + "&e=T&ord=T";
  const editResponse = await fetch(editUrl, {
    method: "GET",
    mode: "cors",
    credentials: "include",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "cache-control": "max-age=0",
      "upgrade-insecure-requests": "1"
    }
  });
  const editHtml = await editResponse.text();
  if (!editResponse.ok) throw new Error("Custom list edit form load failed: HTTP " + editResponse.status);

  const { params } = readFormDefaults(editHtml);
  const listValues = buildCustomListValues(args);
  const currentUser = runtime?.getCurrentUser ? runtime.getCurrentUser() : {};
  const { accountId, csrfToken } = window.getNetsiteParams();
  const ownerId = String(currentUser.id ?? params.get("owner") ?? "");
  const ownerName = currentUser.name || params.get("inpt_owner") || "";

  params.set("submitter", "Save");
  params.set("type", "custlist");
  params.set("id", listId);
  params.set("_csrf", csrfToken || params.get("_csrf") || "");
  params.set("_eml_nkey_", accountId + "~" + ownerId + "~" + (currentUser.role ?? "") + "~N");
  params.set("nsapiCT", Date.now().toString());
  params.set("nsbrowserenv", "istop=T");
  params.set("whence", "/app/common/custom/custlists.nl?scrollid=" + listId);
  params.set("entryformquerystring", "id=" + listId + "&e=T&ord=T");
  if (ownerId) params.set("owner", ownerId);
  if (ownerName) params.set("inpt_owner", ownerName);

  if (listValues.name !== undefined) {
    params.set("name", String(listValues.name));
    params.set("name_send", String(listValues.name));
  }
  if (listValues.scriptid !== undefined) params.set("scriptid", String(listValues.scriptid));
  if (listValues.description !== undefined) params.set("description", String(listValues.description));
  if (listValues.isordered !== undefined) params.set("isordered", listValues.isordered === false ? "F" : "T");
  if (listValues.hierarchical !== undefined) params.set("hierarchical", listValues.hierarchical === true ? "T" : "F");

  Object.entries(listValues).forEach(([fieldId, value]) => {
    if (value !== undefined && !["name", "scriptid", "description", "isordered", "hierarchical"].includes(fieldId)) {
      setIfPresent(params, fieldId, value);
    }
  });

  const hasValueOperations =
    Array.isArray(args.replaceAllValues ?? args.setValues) ||
    Array.isArray(args.valuesToAdd ?? args.addValues) ||
    Array.isArray(args.valuesToUpdate ?? args.updateValues) ||
    Array.isArray(args.values ?? args.listValues);
  let submittedValueCount;
  let valueOperationSummary;
  if (hasValueOperations) {
    const { rows, summary } = applyCustomListValueOperations(params.get("customvaluedata") || "", args);
    submittedValueCount = rows.length;
    valueOperationSummary = summary;
    params.set("customvaluedata", serializeCustomListSublistRows(rows));
    params.set("nextcustomvalueidx", String(rows.length + 1));
    params.set("customvaluevalid", "T");
  }

  const response = await fetch("https://" + domain + "/app/common/custom/custlist.nl", {
    method: "POST",
    mode: "cors",
    credentials: "include",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
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
    referrer: editUrl,
    body: params.toString()
  });

  const html = await response.text();
  if (!response.ok) throw new Error("Custom list form update failed: HTTP " + response.status);
  const formError = extractNetSuiteFormError(html);
  const savedId = extractCustomListIdFromHtml(html) || listId;
  if (!savedId && formError) throw new Error("Custom list form update failed: " + formError);

  return {
    success: true,
    id: savedId,
    recordType: "customlist",
    url: "https://" + domain + "/app/common/custom/custlist.nl?id=" + encodeURIComponent(savedId),
    updatedFields: Object.keys(listValues),
    valueCount: submittedValueCount,
    valueOperations: valueOperationSummary,
    replacedValues: args.replaceValues === true || Array.isArray(args.replaceAllValues ?? args.setValues)
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
      : toNetSuiteBooleanFlag(fieldValues.storevalue);
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

const updateCustomRecordField = async (N, args = {}) => {
  const { runtime, url } = N;
  const customRecordFieldId = String(
    args.customRecordFieldId ?? args.customFieldId ?? args.fieldId ?? args.id ?? ""
  ).trim();
  const customRecordTypeId = String(
    args.customRecordTypeId ?? args.customRecordTypeInternalId ?? args.recordTypeId ?? ""
  ).trim();
  if (!customRecordFieldId) {
    throw new Error("customRecordFieldId is required.");
  }
  if (!customRecordTypeId) {
    throw new Error("customRecordTypeId is required.");
  }

  const fieldValues = buildCustomRecordFieldValues(args);
  const domain = url?.resolveDomain
    ? url.resolveDomain({ hostType: url.HostType.APPLICATION })
    : window.location.host;
  const editUrl = `https://${domain}/app/common/custom/custreccustfield.nl?rectype=${encodeURIComponent(
    customRecordTypeId
  )}&e=T&id=${encodeURIComponent(customRecordFieldId)}`;
  const editResponse = await fetch(editUrl, {
    method: "GET",
    mode: "cors",
    credentials: "include",
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "cache-control": "max-age=0"
    }
  });
  const editHtml = await editResponse.text();
  if (!editResponse.ok) {
    throw new Error(
      `Custom record field edit form load failed: HTTP ${editResponse.status}`
    );
  }

  const { accountId, csrfToken } = window.getNetsiteParams();
  const currentUser = runtime?.getCurrentUser ? runtime.getCurrentUser() : {};
  const ownerId = String(currentUser.id ?? "");
  const ownerName = currentUser.name || "";
  const { params, doc } = readFormDefaults(editHtml);
  const previousFieldType =
    params.get("fieldtype") ||
    params.get("fldcurrenttype") ||
    params.get("originalfieldtype") ||
    "";
  const originalFieldType =
    params.get("originalfieldtype") ||
    params.get("staticfieldtype") ||
    previousFieldType;
  const originalSelectRecordType =
    params.get("originalselectrecordtype") ||
    params.get("staticlistrecordtype") ||
    "";
  let resolvedFieldType =
    fieldValues.fieldtype !== undefined
      ? normalizeCustomRecordFieldUiType(fieldValues.fieldtype)
      : previousFieldType;
  const originalStoredValue =
    previousFieldType && previousFieldType !== resolvedFieldType
      ? "F"
      : params.get("fldcurrstored") || "F";
  let selectRecordTypeFallbackNote = null;

  if (
    (resolvedFieldType === "SELECT" || resolvedFieldType === "MULTISELECT") &&
    (fieldValues.selectrecordtype === undefined ||
      fieldValues.selectrecordtype === null ||
      fieldValues.selectrecordtype === "")
  ) {
    const existingSelectRecordType =
      params.get("selectrecordtype") ||
      params.get("fldcurselrectype") ||
      params.get("staticlistrecordtype") ||
      params.get("originalselectrecordtype") ||
      "";
    if (existingSelectRecordType) {
      fieldValues.selectrecordtype = existingSelectRecordType;
    } else {
      selectRecordTypeFallbackNote =
        "fieldType was SELECT/MULTISELECT but no selectRecordType was provided and no existing select record type was found; defaulted to TEXT.";
      resolvedFieldType = "TEXT";
      fieldValues.fieldtype = "TEXT";
    }
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

  const fieldTypeText =
    CUSTOM_RECORD_FIELD_UI_LABELS[resolvedFieldType] ||
    getSelectOptionTextFromDocument(doc, "fieldtype", resolvedFieldType) ||
    resolvedFieldType;
  const selectRecordTypeText =
    fieldValues.selectrecordtype !== undefined
      ? getSelectOptionTextFromDocument(doc, "selectrecordtype", fieldValues.selectrecordtype) ||
        resolvedSelectRecordType?.matched?.text ||
        resolvedSelectRecordType?.matched?.name ||
        resolvedSelectRecordType?.matched?.Name ||
        params.get("inpt_selectrecordtype")
      : null;

  params.delete("submitter");
  params.set("submitedit", args.submitAction || "Save & Edit");
  const existingLabel = params.get("label") ?? "";
  const nextLabel = fieldValues.label ?? existingLabel;
  params.set("label", nextLabel);
  params.set("label_send", nextLabel);
  if (ownerId) {
    params.set("owner", params.get("owner") || ownerId);
    params.set("inpt_owner", params.get("inpt_owner") || ownerName);
  }
  if (fieldValues.description !== undefined) {
    params.set("description", fieldValues.description);
  }
  params.set("inpt_fieldtype", fieldTypeText);
  params.set("fieldtype", resolvedFieldType);
  if (fieldValues.storevalue !== undefined) {
    const storeValue = toNetSuiteBooleanFlag(fieldValues.storevalue);
    params.set("storevalue", storeValue);
    params.set("storevalue_send", storeValue);
  }
  if (fieldValues.isshowinlist !== undefined) {
    const showInList = toNetSuiteBooleanFlag(fieldValues.isshowinlist);
    params.set("showinlist", showInList);
  }
  normalizeNetSuiteCheckboxParams(params, CUSTOM_FIELD_EDIT_CHECKBOX_FIELDS);
  if (fieldValues.isshowinlist !== undefined) {
    const showInList = toNetSuiteBooleanFlag(fieldValues.isshowinlist);
    params.set("showinlist", showInList);
  }
  params.delete("isshowinlist");
  params.delete("inactive");
  params.set("_eml_nkey_", params.get("_eml_nkey_") || `${accountId}~${ownerId}~${currentUser.role ?? ""}~N`);
  params.set("_multibtnstate_", "EDIT_CUSTRECORDFIELD:submitter:submitedit");
  params.set("nsapiCT", Date.now().toString());
  params.set("nsbrowserenv", "istop=T");
  params.set("type", "custrecordfield");
  params.set("id", customRecordFieldId);
  params.set(
    "whence",
    params.get("whence") ||
      `/app/common/custom/custrecord.nl?id=${customRecordTypeId}&scrollid=${customRecordFieldId}`
  );
  params.set(
    "entryformquerystring",
    params.get("entryformquerystring") ||
      `rectype=${customRecordTypeId}&e=T&id=${customRecordFieldId}`
  );
  if (csrfToken) params.set("_csrf", params.get("_csrf") || csrfToken);
  params.set("originchannel", params.get("originchannel") || "UI");
  params.set("fldcurrenttype", resolvedFieldType);
  params.set("originalfieldtype", originalFieldType);
  params.set("staticfieldtype", originalFieldType);
  params.set("originalselectrecordtype", originalSelectRecordType);
  params.set("staticlistrecordtype", originalSelectRecordType);
  params.set("fldcurrstored", originalStoredValue);
  params.set("rectype", customRecordTypeId);
  params.set("submitted", "T");
  params.set("formdisplayview", "NONE");
  params.set("_button", "");
  params.set("historyloaded", params.get("historyloaded") || "F");
  params.set("historydotted", params.get("historydotted") || "F");
  params.set("systemnotesloaded", "F");
  params.set("systemnotesdotted", "F");

  // These values are copied from NetSuite's successful browser submission.
  // The edit page can expose stale tab/sublist loading state that its client
  // script clears immediately before submit.
  [
    "nsapiPI",
    "nsapiSR",
    "nsapiVF",
    "nsapiFC",
    "nsapiPS",
    "nsapiVI",
    "nsapiVD",
    "nsapiPD",
    "nsapiVL",
    "nsapiRC",
    "nsapiLI",
    "nsapiLC",
    "customwhence",
    "insertbefore",
    "subtab",
    "fldtabsection",
    "customfieldfilterdata",
    "roleaccessdata",
    "deptaccessdata",
    "subaccessdata"
  ].forEach((fieldId) => params.set(fieldId, ""));
  params.set("selectedtab", "DISPLAY");
  params.set("customfieldfilterloaded", "F");
  params.set("roleaccessloaded", "T");
  params.set("deptaccessloaded", "F");
  params.set("subaccessloaded", "F");
  params.set("securityhistoryloaded", "F");
  params.set("securityhistorydotted", "T");
  params.set("historyloaded", "F");
  params.set("historydotted", "F");
  params.set("systemnotesloaded", "F");
  params.set("systemnotesdotted", "F");

  if (fieldValues.selectrecordtype !== undefined) {
    setIfPresent(params, "selectrecordtype", fieldValues.selectrecordtype);
    setIfPresent(params, "fldcurselrectype", fieldValues.selectrecordtype);
    params.set("fldselectislist", "T");
    if (selectRecordTypeText) {
      params.set("inpt_selectrecordtype", selectRecordTypeText);
    }
  } else if (resolvedFieldType !== "SELECT" && resolvedFieldType !== "MULTISELECT") {
    params.set("selectrecordtype", "");
    params.set("fldcurselrectype", "");
    params.set("fldselectislist", "");
    params.set("inpt_selectrecordtype", "");
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
        "isshowinlist",
        "selectrecordtype"
      ].includes(fieldId)
    ) {
      setIfPresent(params, fieldId, value);
    }
  });

  const formEncode = (value) =>
    encodeURIComponent(String(value ?? "")).replace(/%20/g, "+");
  const requestOwnerName = params.get("inpt_owner") || ownerName;
  const requestOwnerId = params.get("owner") || ownerId;
  const requestDescription = fieldValues.description ?? params.get("description") ?? "";
  const requestNKey =
    params.get("_eml_nkey_") ||
    `${accountId}~${ownerId}~${currentUser.role ?? ""}~N`;
  const requestWhence =
    params.get("whence") ||
    `/app/common/custom/custrecord.nl?id=${customRecordTypeId}&e=T&scrollid=${customRecordFieldId}`;
  const requestCsrf = params.get("_csrf") || csrfToken;
  const requestHelp = params.get("help") || "";
  const requestLabelTermRef = params.get("label_term_ref") || "";
  const requestColRefLabel = params.get("colreflabel") || "T";
  const requestHelpTermRef = params.get("help_term_ref") || "";
  const requestColRefHelp = params.get("colrefhelp") || "T";  const requestStoreValue =
    fieldValues.storevalue === undefined
      ? params.get("storevalue") || "T"
      : toNetSuiteBooleanFlag(fieldValues.storevalue);
  const requestShowInList =
    fieldValues.isshowinlist === undefined
      ? params.get("showinlist") || "F"
      : toNetSuiteBooleanFlag(fieldValues.isshowinlist);
  const requestBody = `submitedit=Save+%26+Edit&label=${formEncode(nextLabel)}&label_send=${formEncode(nextLabel)}&inpt_owner=${formEncode(requestOwnerName)}&owner=${formEncode(requestOwnerId)}&description=${formEncode(requestDescription)}&inpt_fieldtype=${formEncode(fieldTypeText)}&fieldtype=${formEncode(resolvedFieldType)}&inpt_selectrecordtype=${formEncode(selectRecordTypeText || "")}&selectrecordtype=${formEncode(fieldValues.selectrecordtype ?? "")}&storevalue=${requestStoreValue}&storevalue_send=${requestStoreValue}&showinlist=${requestShowInList}&aidescription=&_eml_nkey_=${formEncode(requestNKey)}&_multibtnstate_=EDIT_CUSTRECORDFIELD%3Asubmitter%3Asubmitedit&selectedtab=DISPLAY&nsapiPI=&nsapiSR=&nsapiVF=&nsapiFC=&nsapiPS=&nsapiVI=&nsapiVD=&nsapiPD=&nsapiVL=&nsapiRC=&nsapiLI=&nsapiLC=&nsapiCT=${Date.now()}&nsbrowserenv=istop%3DT&type=custrecordfield&id=${formEncode(customRecordFieldId)}&externalid=&whence=${formEncode(requestWhence)}&customwhence=&entryformquerystring=${formEncode(`rectype=${customRecordTypeId}&e=T&id=${customRecordFieldId}`)}&_csrf=${formEncode(requestCsrf)}&originchannel=UI&fldcurrenttype=${formEncode(resolvedFieldType)}&originalfieldtype=${formEncode(originalFieldType)}&originalselectrecordtype=${formEncode(originalSelectRecordType)}&fldselectishierarchical=F&fldselectislist=T&fldcurselrectype=${formEncode(fieldValues.selectrecordtype ?? "")}&fldcurrstored=F&insertbefore=&subtab=&fldtabsection=&displaytype=NORMAL&fldsizelabel=&displaywidth=&displayheight=&applyformatting=F&isunformattedcurrency=F&help=${formEncode(requestHelp)}&parentsubtab=&linktext=&showhierarchy=F&ismandatory=F&checkspelling=F&maxlength=&minvalue=&maxvalue=&defaultchecked=F&defaultvalue=&defaultvaluerte=&isformula=F&defaultselection=&dynamicdefault=&searchdefault=&searchcomparefield=&onparentdelete=NO_ACTION&sourcelist=&sourcefrom=&sourcefilterby=&sourcefromtype=&sourcefromtypedisplay=&sourcefromrecordtype=&sourcefromrecordtypedisplay=&sourcefilterbyrecordtype=&sourcefilterbyrecordtypedisplay=&sourcelistrecordtype=&sourcelistrecordtypedisplay=&sourcefilterreferencedbycount=0&staticfieldtype=${formEncode(originalFieldType)}&staticlistrecordtype=${formEncode(originalSelectRecordType)}&usedassource=F&customsegment=&rectype=${formEncode(customRecordTypeId)}&allowquickadd=F&accesslevel=2&searchlevel=2&label_term_ref=${formEncode(requestLabelTermRef)}&colreflabel=${formEncode(requestColRefLabel)}&help_term_ref=${formEncode(requestHelpTermRef)}&colrefhelp=${formEncode(requestColRefHelp)}&submitted=T&formdisplayview=NONE&_button=&customfieldfilterfields=fldfilter_display%01fldfilter%01fldfiltertype%01fldfilterchecked%01fldfiltercomparetype%01fldfilterval%01fldfiltersel_display%01fldfiltersel%01fldfiltersel_labels%01fldfilternotnull%01fldfilternull%01fldcomparefield_display%01fldcomparefield%01fldselecttype&customfieldfilterflags=8%011%010%010%010%010%018%010%01%010%010%018%010%010&customfieldfilterfieldsets=%01%01%01%01%01%01%01%01customfieldfilter.fldfilter%01%01%01%01%01&customfieldfiltertypes=text%01integer%01text%01checkbox%01select%01text%01textarea%01slaveselect%01text%01checkbox%01checkbox%01text%01slaveselect%01integer&customfieldfilterorigtypes=%01%01%01%01%01%01%01%01%01%01%01%01%01&customfieldfilterparents=selectrecordtype%01selectrecordtype%01customfieldfilter.fldfilter%01%01%01%01customfieldfilter.fldfilter%01customfieldfilter.fldfilter%01%01%01%01customfieldfilter.fldfilter%01customfieldfilter.fldfilter%01&customfieldfilterlabels=Filter+Using%01%01%01Is+Checked%01Compare+Type%01Compare+Value+to%01Value+Is%01%01%01Is+Not+Empty%01Is+Empty%01Compare+to+Field%01%01&customfieldfilterdata=&nextcustomfieldfilteridx=1&customfieldfiltervalid=T&customfieldfilterloaded=F&roleaccessfields=role%01accesslevel%01searchlevel&roleaccessflags=1%011%011&roleaccessfieldsets=%01%01&roleaccesstypes=select%01select%01select&roleaccessorigtypes=%01%01&roleaccessparents=%01%01&roleaccesslabels=Role%01Access+Level%01Level+for+Search%2FReporting&roleaccessdata=&nextroleaccessidx=1&roleaccessvalid=T&roleaccessloaded=T&deptaccessfields=dept%01accesslevel%01searchlevel&deptaccessflags=1%011%011&deptaccessfieldsets=%01%01&deptaccesstypes=select%01select%01select&deptaccessorigtypes=%01%01&deptaccessparents=%01%01&deptaccesslabels=Department%01Access+Level%01Level+for+Search%2FReporting&deptaccessdata=&nextdeptaccessidx=1&deptaccessvalid=T&deptaccessloaded=F&subaccessfields=sub%01accesslevel%01searchlevel&subaccessflags=1%011%011&subaccessfieldsets=%01%01&subaccesstypes=select%01select%01select&subaccessorigtypes=%01%01&subaccessparents=%01%01&subaccesslabels=Subsidiary%01Access+Level%01Level+for+Search%2FReporting&subaccessdata=&nextsubaccessidx=1&subaccessvalid=T&subaccessloaded=F&securityhistoryloaded=F&securityhistorydotted=T&translationsfields=locale%01language%01label%01help&translationsflags=0%010%014%014&translationsfieldsets=%01%01%01&translationstypes=text%01text%01text%01textarea&translationsorigtypes=%01%01%01&translationsparents=%01%01%01&translationslabels=%01Language%01Label%01Help&translationsdata=en%01English+%28International%29%01%01%02fr_FR%01French+%28France%29%01%01%02de_DE%01German%01%01%02it_IT%01Italian%01%01&nexttranslationsidx=5&translationsvalid=T&translationssortidx=0&translationssorttype=TEXT&translationssortdir=UP&translationssortname=language&translationssort2dir=&translationssort2name=&historyloaded=F&historydotted=F&systemnotesloaded=F&systemnotesdotted=F`;  const response = await fetch(
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
      referrer: editUrl,
      body: requestBody
    }
  );
  const html = await response.text();
  if (!response.ok) {
    throw new Error(
      `Custom record field edit form save failed: HTTP ${response.status}: ${extractNetSuiteErrorPageText(html)}`
    );
  }  const formError = extractNetSuiteFormError(html);
  if (formError) {
    throw new Error(`Custom record field edit form save failed: ${formError}`);
  }
  const id = extractCustomRecordFieldIdFromHtml(html) || customRecordFieldId;

  return {
    success: true,
    updated: true,
    id,
    recordType: "customrecordcustomfield",
    rectype: customRecordTypeId,
    url: `https://${domain}/app/common/custom/custreccustfield.nl?rectype=${encodeURIComponent(
      customRecordTypeId
    )}&e=T&id=${encodeURIComponent(id)}`,
    fieldValues,
    resolved: {
      fieldtype: {
        previous: previousFieldType || null,
        value: resolvedFieldType
      },
      ...(selectRecordTypeFallbackNote
        ? { selectrecordtypeFallback: { note: selectRecordTypeFallbackNote } }
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

const updateScriptField = async (N, args = {}) => {
  const { runtime, url } = N;
  const scriptFieldId = String(
    args.scriptFieldId ?? args.fieldId ?? args.id ?? ""
  ).trim();
  const scriptInternalId = String(
    args.scriptInternalId ?? args.scriptRecordId ?? args.parentScriptId ?? ""
  ).trim();
  if (!scriptFieldId) {
    throw new Error("scriptFieldId is required.");
  }
  if (!scriptInternalId) {
    throw new Error("scriptInternalId is required.");
  }

  const fieldValues = buildScriptFieldValues(args);
  const domain = url?.resolveDomain
    ? url.resolveDomain({ hostType: url.HostType.APPLICATION })
    : window.location.host;
  const editUrl = `https://${domain}/app/common/custom/scriptcustfield.nl?e=T&scripttype=${encodeURIComponent(
    scriptInternalId
  )}&id=${encodeURIComponent(scriptFieldId)}`;
  const editResponse = await fetch(editUrl, {
    method: "GET",
    mode: "cors",
    credentials: "include",
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "cache-control": "max-age=0"
    }
  });
  const editHtml = await editResponse.text();
  if (!editResponse.ok) {
    throw new Error(`Script field edit form load failed: HTTP ${editResponse.status}`);
  }

  const { accountId, csrfToken } = window.getNetsiteParams();
  const currentUser = runtime?.getCurrentUser ? runtime.getCurrentUser() : {};
  const ownerId = String(currentUser.id ?? "");
  const ownerName = currentUser.name || "";
  const { params, doc } = readFormDefaults(editHtml);
  const previousFieldType =
    params.get("fieldtype") ||
    params.get("fldcurrenttype") ||
    params.get("originalfieldtype") ||
    "";
  let resolvedFieldType =
    fieldValues.fieldtype !== undefined
      ? normalizeCustomRecordFieldUiType(fieldValues.fieldtype)
      : previousFieldType;
  let selectRecordTypeFallbackNote = null;

  if (
    (resolvedFieldType === "SELECT" || resolvedFieldType === "MULTISELECT") &&
    (fieldValues.selectrecordtype === undefined ||
      fieldValues.selectrecordtype === null ||
      fieldValues.selectrecordtype === "")
  ) {
    const existingSelectRecordType =
      params.get("selectrecordtype") ||
      params.get("fldcurselrectype") ||
      params.get("staticlistrecordtype") ||
      "";
    if (existingSelectRecordType) {
      fieldValues.selectrecordtype = existingSelectRecordType;
    } else {
      selectRecordTypeFallbackNote =
        "fieldType was SELECT/MULTISELECT but no selectRecordType was provided and no existing select record type was found; defaulted to TEXT.";
      resolvedFieldType = "TEXT";
      fieldValues.fieldtype = "TEXT";
    }
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

  const fieldTypeText =
    CUSTOM_RECORD_FIELD_UI_LABELS[resolvedFieldType] ||
    getSelectOptionTextFromDocument(doc, "fieldtype", resolvedFieldType) ||
    resolvedFieldType;

  params.delete("submitter");
  params.set("submitedit", args.submitAction || "Save & Edit");
  params.set("label", fieldValues.label ?? params.get("label") ?? "");
  params.set("label_send", fieldValues.label ?? params.get("label_send") ?? params.get("label") ?? "");
  if (ownerId) {
    params.set("owner", params.get("owner") || ownerId);
    params.set("inpt_owner", params.get("inpt_owner") || ownerName);
  }
  if (fieldValues.description !== undefined) {
    params.set("description", fieldValues.description);
  }
  params.set("inpt_fieldtype", fieldTypeText);
  params.set("fieldtype", resolvedFieldType);
  if (fieldValues.storevalue !== undefined) {
    const storeValue = toNetSuiteBooleanFlag(fieldValues.storevalue);
    params.set("storevalue", storeValue);
    params.set("storevalue_send", storeValue);
    params.set("fldcurrstored", storeValue);
  }
  params.set("inpt_setting", params.get("inpt_setting") || " ");
  params.set("setting", fieldValues.setting ?? params.get("setting") ?? "");
  params.set("_eml_nkey_", params.get("_eml_nkey_") || `${accountId}~${ownerId}~${currentUser.role ?? ""}~N`);
  params.set("_multibtnstate_", params.get("_multibtnstate_") || "EDIT_CUSTSCRIPTFIELD:submitter:submitedit");
  params.set("nsapiCT", Date.now().toString());
  params.set("nsbrowserenv", "istop=T");
  params.set("type", "custscriptfield");
  params.set("id", scriptFieldId);
  params.set(
    "whence",
    params.get("whence") || `/app/common/scripting/script.nl?id=${scriptInternalId}&scrollid=${scriptFieldId}`
  );
  params.set(
    "entryformquerystring",
    params.get("entryformquerystring") || `e=T&scripttype=${scriptInternalId}&id=${scriptFieldId}`
  );
  if (csrfToken) params.set("_csrf", params.get("_csrf") || csrfToken);
  params.set("originchannel", params.get("originchannel") || "UI");
  params.set("fldcurrenttype", resolvedFieldType);
  params.set("staticfieldtype", resolvedFieldType);
  params.set("scripttype", scriptInternalId);
  params.set("submitted", "T");
  params.set("formdisplayview", "NONE");
  params.set("_button", "");
  params.set("historyloaded", params.get("historyloaded") || "F");
  params.set("historydotted", params.get("historydotted") || "F");
  params.set("systemnotesloaded", params.get("systemnotesloaded") || "F");
  params.set("systemnotesdotted", params.get("systemnotesdotted") || "F");

  if (fieldValues.selectrecordtype !== undefined) {
    setIfPresent(params, "selectrecordtype", fieldValues.selectrecordtype);
    setIfPresent(params, "fldcurselrectype", fieldValues.selectrecordtype);
    setIfPresent(params, "fldselectislist", "T");
    setIfPresent(params, "staticlistrecordtype", fieldValues.selectrecordtype);
  } else if (resolvedFieldType !== "SELECT" && resolvedFieldType !== "MULTISELECT") {
    params.set("selectrecordtype", "");
    params.set("fldcurselrectype", "");
    params.set("fldselectislist", "");
    params.set("staticlistrecordtype", "");
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
      referrer: editUrl,
      body: params.toString()
    }
  );

  const html = await response.text();
  if (!response.ok) {
    throw new Error(`Script field edit form save failed: HTTP ${response.status}`);
  }
  const formError = extractNetSuiteFormError(html);
  const id = extractScriptFieldIdFromHtml(html) || scriptFieldId;
  if (!id && formError) {
    throw new Error(`Script field edit form save failed: ${formError}`);
  }

  return {
    success: true,
    updated: true,
    id,
    recordType: "scriptcustomfield",
    scripttype: scriptInternalId,
    url: `https://${domain}/app/common/custom/scriptcustfield.nl?scripttype=${encodeURIComponent(
      scriptInternalId
    )}&e=T&id=${encodeURIComponent(id)}`,
    fieldValues,
    resolved: {
      fieldtype: {
        previous: previousFieldType || null,
        value: resolvedFieldType
      },
      ...(selectRecordTypeFallbackNote
        ? { selectrecordtypeFallback: { note: selectRecordTypeFallbackNote } }
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
  RUN_SUITEQL_QUERY: async ({ modules, payload: { sql, limit, offset } }) => {
    console.log("Run SuiteQL Query action received", { limit, offset });
    return window.runSuiteQLQuery(modules, sql, limit ?? 1000, offset ?? 0);
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
  BATCH_DELETE_FILE_CABINET_ITEMS: async ({ modules, payload = {} }) => {
    const files = Array.isArray(payload.files) ? payload.files : [];
    const folderIds = Array.isArray(payload.folderIds) ? payload.folderIds : [];
    const deletedFiles = [];
    const deletedFolders = [];
    const errors = [];

    for (const file of files) {
      try {
        const deleteResult = await window.deleteNetsuiteFile(modules, {
          fileId: Number(file.fileId),
          folderId: Number(file.folderId)
        });
        if (deleteResult !== "success") {
          throw new Error(String(deleteResult || "File deletion failed"));
        }
        deletedFiles.push(Number(file.fileId));
      } catch (error) {
        errors.push({
          type: "file",
          id: Number(file.fileId),
          error: error?.message || String(error)
        });
      }
    }

    for (const folderId of folderIds) {
      try {
        await window.deleteFolder(modules, { folderId: Number(folderId) });
        deletedFolders.push(Number(folderId));
      } catch (error) {
        errors.push({
          type: "folder",
          id: Number(folderId),
          error: error?.message || String(error)
        });
      }
    }

    return { deletedFiles, deletedFolders, errors };
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
  GET_RECORD_URL: async ({
    modules,
    payload: { type, id, isEditMode = false }
  }) => {
    const { url } = modules;
    const relativeUrl = url.resolveRecord({
      recordType: type,
      recordId: id,
      isEditMode
    });
    const domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
    return new URL(relativeUrl, `https://${domain}`).href;
  },
  GET_RECORD_FIELD_DATA: async ({
    modules,
    payload: { type, id, fieldId, sublistId, line }
  }) => {
    const rec = modules.record.load({ type, id });
    const isSublistField =
      typeof sublistId === "string" && Number.isInteger(Number(line));

    if (isSublistField) {
      const options = {
        sublistId,
        fieldId,
        line: Number(line)
      };
      let value = null;
      let text = null;
      try {
        value = rec.getSublistValue(options);
      } catch {}
      try {
        text = rec.getSublistText(options);
      } catch {}
      return { value, text };
    }

    let value = null;
    let text = null;
    try {
      value = rec.getValue({ fieldId });
    } catch {}
    try {
      text = rec.getText({ fieldId });
    } catch {}
    return { value, text };
  },
  SEARCH_RECORDS: async ({
    modules,
    payload: { recordType, searchText = "", pageIndex = 0, pageSize = 25 }
  }) => {
    const { search } = modules;
    const normalizedType = String(recordType ?? "").trim().toLowerCase();
    const enumKey = normalizedType
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .replace(/[^a-z0-9]+/g, "_")
      .toUpperCase();
    const searchType = search.Type?.[enumKey] ?? normalizedType;
    const cleanText = String(searchText ?? "").trim();
    const numericSearch = /^\d+$/.test(cleanText);

    const entityTypes = new Set([
      "lead",
      "prospect",
      "customer",
      "contact",
      "vendor",
      "partner",
      "employee"
    ]);
    const transactionTypes = new Set([
      "salesorder",
      "invoice",
      "purchaseorder",
      "vendorbill",
      "estimate",
      "creditmemo",
      "journalentry",
      "itemfulfillment",
      "cashsale"
    ]);

    let columns = [
      search.createColumn({ name: "internalid", sort: search.Sort.DESC })
    ];
    let filters = [];

    if (entityTypes.has(normalizedType)) {
      columns = [
        search.createColumn({ name: "internalid", sort: search.Sort.DESC }),
        search.createColumn({ name: "entityid" }),
        search.createColumn({ name: "companyname" }),
        search.createColumn({ name: "email" })
      ];
      if (cleanText) {
        filters = numericSearch
          ? [["internalid", search.Operator.ANYOF, cleanText]]
          : [
              ["entityid", search.Operator.CONTAINS, cleanText],
              "OR",
              ["companyname", search.Operator.CONTAINS, cleanText],
              "OR",
              ["email", search.Operator.CONTAINS, cleanText]
            ];
      }
    } else if (transactionTypes.has(normalizedType)) {
      columns = [
        search.createColumn({ name: "internalid", sort: search.Sort.DESC }),
        search.createColumn({ name: "tranid" }),
        search.createColumn({ name: "entity" }),
        search.createColumn({ name: "trandate" })
      ];
      if (cleanText) {
        filters = numericSearch
          ? [["internalid", search.Operator.ANYOF, cleanText]]
          : [["tranid", search.Operator.CONTAINS, cleanText]];
      }
    } else if (cleanText) {
      filters = numericSearch
        ? [["internalid", search.Operator.ANYOF, cleanText]]
        : [["name", search.Operator.CONTAINS, cleanText]];
      columns.push(search.createColumn({ name: "name" }));
    }

    const recordSearch = search.create({
      type: searchType,
      filters,
      columns
    });
    const safePageSize = Math.max(5, Math.min(1000, Number(pageSize) || 25));
    const paged = recordSearch.runPaged({ pageSize: safePageSize });
    const safePageIndex = Math.max(
      0,
      Math.min(Number(pageIndex) || 0, Math.max(0, paged.pageRanges.length - 1))
    );
    const page = paged.count > 0 ? paged.fetch({ index: safePageIndex }) : null;
    const rows = (page?.data ?? []).map((result) => {
      const values = {};
      for (const column of columns) {
        const name = column.name;
        try {
          values[name] = result.getValue(column);
        } catch {}
        try {
          const text = result.getText(column);
          if (text !== null && text !== undefined && text !== "") {
            values[`${name}text`] = text;
          }
        } catch {}
      }
      return {
        id: String(result.id),
        recordType: result.recordType,
        ...values
      };
    });

    return {
      results: rows,
      totalCount: paged.count,
      pageIndex: safePageIndex,
      pageSize: safePageSize,
      source: "N/search"
    };
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
  GET_RECORD_FIELD_TYPES: async ({ modules, payload: { type, id, fieldIds } }) => {
    console.log("Get Record Field Types action received", { type, id, fieldIds });
    return window.getRecordFieldTypes(modules, { type, id, fieldIds });
  },
  GET_CUSTOM_LISTS: async ({ modules, payload }) => {
    console.log("Get Custom Lists action received", payload);
    return window.getCustomLists(modules, payload);
  },
  GET_CUSTOM_LIST_ITEMS: async ({ modules, payload }) => {
    console.log("Get Custom List Items action received", payload);
    return window.getCustomListItems(modules, payload);
  },
  CREATE_CUSTOM_LIST: async ({ modules, payload }) => {
    console.log("Create Custom List action received");
    return createCustomList(modules, payload);
  },
  UPDATE_CUSTOM_LIST: async ({ modules, payload }) => {
    console.log("Update Custom List action received");
    return updateCustomList(modules, payload);
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
  UPDATE_CUSTOM_RECORD_FIELD: async ({ modules, payload }) => {
    console.log("Update Custom Record Field action received");
    return updateCustomRecordField(modules, payload);
  },
  CREATE_SCRIPT_FIELD: async ({ modules, payload }) => {
    console.log("Create Script Field action received");
    return createScriptField(modules, payload);
  },
  UPDATE_SCRIPT_FIELD: async ({ modules, payload }) => {
    console.log("Update Script Field action received");
    return updateScriptField(modules, payload);
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
