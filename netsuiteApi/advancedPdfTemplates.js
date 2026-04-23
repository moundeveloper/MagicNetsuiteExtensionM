window.getAdvancedPDFTemplates = async (N) => {
  const { query } = N;

  let sql = `
SELECT
    CustomRecordType.name as customRecordType,
    AdvancedPdfTemplate.id,
    AdvancedPdfTemplate.inactive,
    AdvancedPdfTemplate.name,
    AdvancedPdfTemplate.preferred,
    AdvancedPdfTemplate.printType,
    AdvancedPdfTemplate.savedSearch,
    AdvancedPdfTemplate.scriptId,
    AdvancedPdfTemplate.tranType,
    CustomRecordType.scriptid as customrecordtypescriptid
FROM AdvancedPdfTemplate
LEFT JOIN CustomRecordType
    ON AdvancedPdfTemplate.customrecordtype = CustomRecordType.internalid
WHERE AdvancedPdfTemplate.scriptId NOT LIKE 'STDTMPL%'
`;

  let resultSet;
  let hasCustomTransactionType = false;

  // Try query with CustomTransactionType first, fall back if not available
  const sqlWithCTT = sql
    .replace(
      "AdvancedPdfTemplate.tranType,",
      `AdvancedPdfTemplate.tranType,
    CustomTransactionType.name as customTransactionType,`
    )
    .replace(
      "WHERE",
      `LEFT JOIN CustomTransactionType
    ON AdvancedPdfTemplate.customtransactiontype = CustomTransactionType.id
WHERE`
    );

  try {
    const queryConfig = { query: sqlWithCTT };
    resultSet = await query.runSuiteQL.promise(queryConfig);
    hasCustomTransactionType = true;
  } catch (error) {
    if (
      error.message?.includes("CustomTransactionType") ||
      error.message?.includes("was not found")
    ) {
      const queryConfig = { query: sql };
      resultSet = await query.runSuiteQL.promise(queryConfig);
      hasCustomTransactionType = false;
    } else {
      throw error;
    }
  }

  const results = resultSet.asMappedResults();

  console.log("Advanced PDF Templates: ", results.length);

  const allLinks = await getPdfTemplateLinks();

  // Example: exclude savedsearchid = -1
  const allLinksById = new Map();

  // First, build a map by ID from allLinks
  allLinks.forEach((link) => {
    // Using id if exists, or savedsearchid as fallback
    const key = String(link.id ?? link.savedsearchid);

    if (!allLinksById.has(key)) {
      allLinksById.set(key, { tt: link.tt, recordType: link.recordType });
    }
  });

  // Now iterate results and fill missing trantype/recordtype
  results.forEach((result) => {
    if (!result.trantype) {
      // Use id or savedsearch to match with allLinks
      const key = String(result.id ?? result.savedsearch);

      if (allLinksById.has(key)) {
        const { tt, recordType } = allLinksById.get(key);
        result.trantype = tt;
        result.recordtype = recordType;
      }
    }
  });

  return results;
};

window.getAdvancedPDFTemplatesContent = async (
  N,
  {
    templateId,
    printType,
    transactionType,
    customRecordType,
    savedSearch,
    version
  }
) => {
  const latestTemplate = await getTemplateContent({
    templateId,
    printType,
    transactionType,
    customRecordType,
    savedSearch,
    version
  });

  return latestTemplate;
};

const getTemplateContent = async ({
  templateId,
  printType,
  transactionType,
  customRecordType = null,
  savedSearch = null,
  version = null,
  maxRetries = 3,
  retryDelayMs = 1000
}) => {
  const fetchTemplate = async () => {
    const baseUrl = window.location.origin;
    const url = new URL(
      `${baseUrl}/app/common/custom/advancedprint/pdftemplate.nl`
    );
    url.searchParams.set("id", templateId);
    url.searchParams.set("nl", "F");
    url.searchParams.set("pt", printType);

    if (printType === "CUSTOMRECORD") {
      url.searchParams.set("tt", "Custom");
    } else {
      url.searchParams.set("tt", transactionType);
    }

    url.searchParams.set("source", "T");

    if (customRecordType) url.searchParams.set("rt", customRecordType);

    url.searchParams.set("e", "T");
    url.searchParams.set("sc", "-90");
    if (version) url.searchParams.set("version", version);

    if (savedSearch) url.searchParams.set("savedsearchid", savedSearch);

    console.log("url.searchParams", {
      templateId,
      printType,
      transactionType,
      customRecordType,
      savedSearch,
      version
    });

    const response = await fetch(url.toString(), {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "it-IT,it;q=0.6",
        "sec-ch-ua":
          '"Not:A-Brand";v="99", "Brave";v="145", "Chromium":v="145"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "sec-gpc": "1",
        "upgrade-insecure-requests": "1"
      },
      referrer: `${baseUrl}/app/common/custom/pdftemplates.nl`,
      method: "GET",
      credentials: "include"
    });

    const htmlText = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");

    const versionSpan = doc.querySelector("#pdftemplate-version-number");
    const currentVersion = versionSpan
      ? parseInt(versionSpan.textContent.trim(), 10)
      : 0;

    const textarea = doc.querySelector('textarea#template[name="template"]');
    const templateContent = textarea ? textarea.value : null;

    return { templateContent, currentVersion };
  };

  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await fetchTemplate();
      if (result.templateContent != null) {
        return result;
      }
      console.warn(
        `Template content empty for ${templateId}, retry ${attempt + 1}/${maxRetries}`
      );
    } catch (error) {
      lastError = error;
      console.warn(
        `Fetch template error: ${error.message}, retry ${attempt + 1}/${maxRetries}`
      );
    }

    if (attempt < maxRetries - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelayMs * (attempt + 1))
      );
    }
  }

  throw (
    lastError ||
    new Error(`Failed to fetch template content after ${maxRetries} retries`)
  );
};

const getPdfTemplateLinks = async () => {
  const baseUrl = window.location.origin;
  const url = `${baseUrl}/app/common/custom/pdftemplates.nl`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "include"
  });

  const html = await response.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const links = [
    ...doc.querySelectorAll("td.listtext.uir-list-row-cell a.dottedlink")
  ];

  return links
    .map((link) => {
      const href = link.getAttribute("href");
      if (!href) return null;

      const fullUrl = new URL(href, baseUrl);

      // Navigate to the parent row
      const tr = link.closest("tr");
      let recordType = null;

      if (tr) {
        const tds = tr.querySelectorAll("td");
        // 4th column = index 3
        if (tds[3]) {
          recordType = tds[3].textContent.trim();
        }
      }

      return {
        id: fullUrl.searchParams.get("id"),
        tt: fullUrl.searchParams.get("tt"),
        savedsearchid: fullUrl.searchParams.get("savedsearchid"),
        recordType
      };
    })
    .filter(Boolean);
};

window.savePdfTemplate = async (N, data) => {
  return updatePdfTemplate(data);
};

window.previewPdfTemplate = async (
  N,
  {
    templateId,
    tranType,
    printType,
    recordType,
    savedSearch,
    templateScriptId,
    template
  }
) => {
  // TODO: Implement preview functionality
  console.log("Preview function called with data:", {
    templateId,
    tranType,
    printType,
    recordType,
    savedSearch,
    templateScriptId,
    template
  });

  if (printType === "CUSTOMRECORD") {
    tranType = "Custom";
  }

  if (!tranType) {
    console.error("Missing tranType");
    return;
  }

  const baseUrl = window.location.origin;
  const url = `${baseUrl}/app/common/custom/advancedprint/pdftemplate.nl?id=${templateId}&nl=F&tt=${tranType}&pt=${printType}&source=T&savedsearchid=${savedSearch || "-1"}&rt=&e=T&sc=-90`;
  const body = new URLSearchParams({
    action: "PREVIEW",
    templateId,
    displaySource: "T",
    tranType,
    printType: printType,
    recordType: recordType || "",
    createdFromCompId: "NL",
    createdFromId: printType === "SEARCH" ? "0" : "2",
    createdFromVersion: printType === "SEARCH" ? "3" : "6",
    preferred: "F",
    inactive: "F",
    description: "F",
    savedSearchId: savedSearch || "-1",
    returnToSavedSearchDef: "F",
    showAppIdField: "F",
    scriptId:
      "_" + templateScriptId.toLowerCase().split("_").slice(1).join("_"),
    orientation: "p",
    size: "Letter",
    top: 0,
    right: 0,
    bottom: 0.5,
    left: 0,
    size: "in",
    template: template
  });

  // Fetch the PDF preview
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-language": "it-IT,it;q=0.6",
      "cache-control": "max-age=0",
      "content-type": "application/x-www-form-urlencoded",
      "sec-ch-ua": '"Not:A-Brand";v="99", "Brave";v="145", "Chromium";v="145"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "sec-gpc": "1",
      "upgrade-insecure-requests": "1"
    },
    body,
    mode: "cors",
    credentials: "include",
    referrer: url
  });

  // Convert to PDF and show in popup
  const pdfData = await response.arrayBuffer();
  const pdfBlob = new Blob([pdfData], { type: "application/pdf" });
  const pdfUrl = URL.createObjectURL(pdfBlob);

  console.log("PDF URL:", pdfUrl);

  return pdfUrl;
};

/**
 * Update a NetSuite Advanced PDF/HTML template via fetch
 */
const updatePdfTemplate = async ({
  templateId,
  printType,
  tranType,
  savedSearch,
  name,
  fromVersion,
  recordType,
  templateScriptId,
  xmlBody
}) => {
  if (!templateId || !xmlBody || !printType || !name || !fromVersion) {
    console.error(
      "Missing templateId, xmlBody, printType, name or fromVersion",
      JSON.stringify({ templateId, xmlBody, printType, name, fromVersion })
    );
    return;
  }

  const baseUrl = window.location.origin;

  if (printType === "CUSTOMRECORD") {
    tranType = "Custom";
  }

  if (!tranType) {
    console.error("Missing tranType");
    return;
  }

  console.log("TranType [savePdfTemplate]: ", tranType);
  const params = {
    action: "SAVE_EDIT",
    templateId: templateId,
    displaySource: "T",
    tranType: tranType,
    printType: printType,
    recordType: recordType || "",
    createdFromCompId: "NL",
    createdFromId: printType === "SEARCH" ? "0" : "2",
    createdFromVersion: printType === "SEARCH" ? "3" : "6",
    name: name,
    description: "",
    savedSearchId: savedSearch || "-1",
    returnToSavedSearchDef: "F",
    showAppIdField: "F",
    scriptId:
      "_" + templateScriptId.toLowerCase().split("_").slice(1).join("_"),
    orientation: "p",
    size: "Letter",
    top: "0",
    right: "0",
    bottom: "0.5",
    left: "0",
    size: "in",
    template: xmlBody
  };

  console.log("Params [savePdfTemplate]: ", params);

  const urlParams = new URLSearchParams(params);

  const response = await fetch(
    `${baseUrl}/app/common/custom/advancedprint/pdftemplate.nl`,
    {
      method: "POST",
      headers: {
        accept: "text/plain, */*; q=0.01",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest"
      },
      body: urlParams
    }
  );
  console.log("Template updated?:", response);

  if (!response.ok) {
    throw new Error(
      `Failed to update template: ${response.status} ${response.statusText}`
    );
  }

  const raw = await response.text();

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.log("Error Parsing Template Response:", error);
    return;
  }
};
