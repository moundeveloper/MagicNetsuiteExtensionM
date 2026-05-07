window.getRootFolders = async ({ query }) => {
  const rootFolders = query
    .runSuiteQL({
      query: `
        SELECT id, name
        FROM MediaItemFolder
        WHERE IsTopLevel = 'T'
        `
    })
    .asMappedResults();
  return rootFolders;
};

window.createFolder = async ({ runtime }, { folderName, parentFolderId }) => {
  const { csrfToken, accountId } = getNetsiteParams();
  const { id, role } = runtime.getCurrentUser();
  const baseUrl = `https://${accountId}.app.netsuite.com/app/common/media/mediaitemfolder.nl`;

  const timestamp = Date.now();
  const cmid = `${timestamp}_${Math.floor(Math.random() * 100000)}`;

  // Build body as raw string to match exact encoding
  const body = `submitnew=Save+%26+New&name=${encodeURIComponent(
    folderName
  )}&parent=${parentFolderId}&inpt_foldertype=Documents+and+Files&foldertype=DEFAULT&description=&inpt_class=+&class=&inpt_department=+&department=&inpt_location=+&location=&inpt_subsidiary=+&subsidiary=&inpt_group=+&group=&_eml_nkey_=${accountId}%7E${id}%7E${role}%7EN&_multibtnstate_=EDIT_MEDIAITEMFOLDER%3Asubmitter%3Asubmitnew&selectedtab=&nsapiPI=&nsapiSR=&nsapiVF=&nsapiFC=&nsapiPS=&nsapiVI=&nsapiVD=&nsapiPD=&nsapiVL=&nsapiRC=&nsapiLI=&nsapiLC=&nsapiCT=${timestamp}&nsbrowserenv=istop%3DT&type=filecabinet&id=&externalid=&whence=%2Fapp%2Fcommon%2Fmedia%2Fmediaitemfolders.nl%3Ffolder%3D${parentFolderId}%26cmid%3D${cmid}&customwhence=&entryformquerystring=parent%3D${parentFolderId}&_csrf=${encodeURIComponent(
    csrfToken
  )}&parentofparent=&owner=&submitted=T&formdisplayview=NONE&_button=&usernotesfields=id%01title%01note%01author%01notedate%01time%01notetype%01direction&usernotesflags=0%010%011%010%010%010%010%010&usernotesfieldsets=%01%01%01%01%01%01%01&usernotestypes=integer%01text%01textarea%01integer%01date%01timeofday%01select%01select&usernotesorigtypes=%01%01%01%01%01%01%01&usernotesparents=%01%01%01%01%01%01%01&usernoteslabels=%01Title%01Memo%01%01Date%01Time%01Type%01Direction&usernotesdata=&nextusernotesidx=1&usernotesvalid=T`;

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "it-IT,it;q=0.6",
        "cache-control": "max-age=0",
        "content-type": "application/x-www-form-urlencoded",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1"
      },
      referrer: `https://${accountId}.app.netsuite.com/app/common/media/mediaitemfolder.nl?parent=${parentFolderId}`,
      body: body,
      credentials: "include",
      mode: "cors"
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const resultHtml = await response.text();

    // Extract folder ID from HTML
    const folderId = extractFolderIdFromHtml(resultHtml);

    console.log(
      "Folder created. ID:",
      folderId,
      "HTML length:",
      resultHtml.length
    );

    // Return id
    return { folderId };
  } catch (error) {
    console.error("Error creating folder:", error);
    throw error;
  }
};

/**
 * Upload one or more files to the NetSuite File Cabinet.
 *
 * Two modes:
 *  - content mode  (AI-driven): pass { fileName, fileContent, folderId }
 *    The function builds a Blob from the string content and POSTs it directly.
 *  - picker mode   (user-driven): pass { folderId } only (or omit fileName/fileContent)
 *    The function opens a hidden <input type="file"> so the user can pick files.
 *
 * @param {object} N  - unused, kept for consistency with other handlers
 * @param {object} options
 * @param {string}  [options.fileName]    - file name (required in content mode)
 * @param {string}  [options.fileContent] - raw text content (required in content mode)
 * @param {number|string} [options.folderId=-15] - target folder ID (default: SuiteScripts)
 * @param {string}  [options.csrfToken]   - CSRF token (injected by handler)
 * @returns {Promise<{uploaded: Array<{name: string, fileId: string|null}>, errors: string[]}>}
 */
window.uploadFile = async (
  N,
  { fileName, fileContent, folderId = -15, csrfToken }
) => {
  const targetFolder = String(folderId);

  /**
   * Core upload: POSTs a single File/Blob to the NetSuite media import endpoint.
   * @param {File|Blob} file
   * @param {string} name
   * @returns {Promise<{name: string, ok: boolean, fileId: string|null, error?: string}>}
   */
  const postFile = async (file, name) => {
    const csrf =
      csrfToken || document.querySelector('input[name="_csrf"]')?.value || "";

    const formData = new FormData();
    formData.set("sortcol", "sortname");
    formData.set("sortdir", "ASC");
    formData.set("csv", "HTML");
    formData.set("OfficeXML", "F");
    formData.set("pdf", "");
    formData.set("size", "50");
    formData.set("_csrf", csrf);
    formData.set("filetype", "DOCUMENT");
    formData.set("dest_url", "/app/common/media/mediaitemfolders.nl");
    formData.set("folder", targetFolder);
    formData.set("quickAdd", "T");
    formData.set("mediakeyword", "");
    formData.set("unzip", "F");
    formData.set("segment", "");
    formData.set("mediafile", file, name);

    try {
      const response = await fetch("/app/common/media/importmediabatch.nl", {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`Upload failed: ${name}`, text);
        return {
          name,
          ok: false,
          fileId: null,
          error: `HTTP ${response.status}`
        };
      }

      const html = await response.text();
      const fileId = extractFileIdFromHtml(html, name);

      console.log(`File uploaded: ${name}`, "ID:", fileId);
      return { name, ok: true, fileId };
    } catch (err) {
      console.error(`Upload error: ${name}`, err);
      return { name, ok: false, fileId: null, error: err.message };
    }
  };

  // ── Content mode: AI supplies file name + content string ──────────────────
  if (fileName && fileContent !== undefined) {
    const blob = new Blob([fileContent], { type: "text/plain" });
    const result = await postFile(blob, fileName);
    return {
      uploaded: result.ok ? [{ name: result.name, fileId: result.fileId }] : [],
      errors: result.ok ? [] : [`${result.name}: ${result.error}`]
    };
  }

  // ── Picker mode: open file picker so the user can select files ────────────
  return new Promise((resolve) => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    fileInput.addEventListener("change", async (ev) => {
      const files = Array.from(ev.target.files ?? []);
      fileInput.remove();

      if (!files.length) {
        resolve({ uploaded: [], errors: ["No files selected"] });
        return;
      }

      const uploaded = [];
      const errors = [];

      for (const file of files) {
        const result = await postFile(file, file.name);
        if (result.ok) {
          uploaded.push({ name: result.name, fileId: result.fileId });
        } else {
          errors.push(`${result.name}: ${result.error}`);
        }
      }

      resolve({ uploaded, errors });
    });

    // User cancelled dialog → resolve after a short timeout
    fileInput.addEventListener("cancel", () => {
      fileInput.remove();
      resolve({ uploaded: [], errors: ["File picker cancelled"] });
    });

    fileInput.click();
  });
};

// Helper: try common extraction points
function extractFolderIdFromHtml(html) {
  // 1) hidden input named "id"
  const idInput = new DOMParser()
    .parseFromString(html, "text/html")
    .querySelector('input[name="id"]');
  if (idInput && idInput.value) return idInput.value;

  // 2) anchor with mediaitemfolder.nl?parent=...
  const doc = new DOMParser().parseFromString(html, "text/html");
  const anchors = Array.from(
    doc.querySelectorAll('a[href*="mediaitemfolder.nl?parent="]')
  );
  for (const a of anchors) {
    const m = a.href.match(/parent=(\d+)/);
    if (m) return m[1];
  }

  // 3) a plain text match like "...mediaitemfolder.nl?parent=1234"
  const m2 = html.match(/mediaitemfolder\.nl\?parent=(\d+)/);
  if (m2) return m2[1];

  return null;
}

/**
 * Extract the internal file ID of the most-recently uploaded file from the
 * folder-listing HTML returned by importmediabatch.nl.
 *
 * Three extraction strategies (same pattern as extractFolderIdFromHtml):
 *  1. Find the list row whose Name cell contains the uploaded file name and
 *     read the Internal-ID cell (class "listtextrt", data-list-cell-type="numerickey").
 *  2. Find the edit link for the file name and parse the `id` query param.
 *  3. Regex fallback: first occurrence of mediaitem.nl?id=(\d+) in the HTML.
 *
 * @param {string} html       - raw HTML response text
 * @param {string} [fileName] - uploaded file name (helps pick the right row)
 * @returns {string|null}
 */
function extractFileIdFromHtml(html, fileName) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // 1) Walk list rows; match by file name in the Name cell, read ID cell
  const rows = Array.from(doc.querySelectorAll("tr.uir-list-row-tr"));
  for (const row of rows) {
    const idCell = row.querySelector(
      'td[data-list-cell-type="numerickey"].listtextrt'
    );
    const nameCell = row.querySelector(
      'td[data-list-cell-type="string"].listtext'
    );

    if (!idCell) continue;

    const idText = idCell.textContent.trim();

    // If we know the file name, verify this row belongs to it
    if (fileName) {
      if (nameCell && nameCell.textContent.includes(fileName) && idText) {
        return idText;
      }
    } else if (idText) {
      // No file name hint → return the first numeric-key cell found
      return idText;
    }
  }

  // 2) Edit link: <a href="/app/common/media/mediaitem.nl?id=20465&e=T">
  if (fileName) {
    const editLinks = Array.from(
      doc.querySelectorAll('a[href*="mediaitem.nl?id="][href*="e=T"]')
    );
    for (const a of editLinks) {
      // The sibling text of the link's parent row should contain the file name
      const row = a.closest("tr");
      if (row && row.textContent.includes(fileName)) {
        const m = a.href.match(/[?&]id=(\d+)/);
        if (m) return m[1];
      }
    }
  }

  // 3) Regex fallback: first mediaitem.nl?id=<digits> in the document
  const m = html.match(/mediaitem\.nl\?id=(\d+)/);
  if (m) return m[1];

  return null;
}

window.deleteNetsuiteFile = async (N, { fileId, folderId }) => {
  const { csrfToken, accountId } = window.getNetsiteParams();

  const url = `https://${accountId}.app.netsuite.com/app/common/media/mediaitem.nl`;

  const fields = {
    delete_media: "Delete",
    folder: folderId,
    description: "",
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
    nsapiCT: String(Date.now()),
    nsbrowserenv: "istop=T",
    type: "filecabinet",
    id: fileId,
    externalid: "",
    customwhence: "",
    entryformquerystring: `id=${fileId}&e=T`,
    _csrf: csrfToken,
    uploadrectype: "filecabinet",
    package: "",
    oldfolder: folderId,
    caption: "",
    storedisplaythumbnail: "",
    sitedescription: "",
    featureddescription: "",
    submitted: "",
    formdisplayview: "NONE",
    _button: "",
    sitecategoryfields:
      "website\x01category_display\x01category\x01isdefault\x01categorydescription",
    sitecategoryflags: "1\x018\x011\x010\x010",
    sitecategoryfieldsets: "\x01\x01\x01\x01",
    sitecategorytypes: "select\x01text\x01slaveselect\x01checkbox\x01text",
    sitecategoryorigtypes: "\x01\x01\x01\x01",
    sitecategoryparents:
      "\x01sitecategory.website\x01sitecategory.website\x01\x01sitecategory.category",
    sitecategorylabels:
      "Site\x01Site Category\x01\x01Preferred Category\x01Description",
    sitecategorydata: "",
    nextsitecategoryidx: "1",
    sitecategoryvalid: "T",
    usernotesloaded: "F",
    usernotesdotted: "F",
    systemnotesloaded: "F",
    systemnotesdotted: "F"
  };

  // Must use FormData to match original multipart/form-data encoding
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  // Empty file field (required by original request)
  formData.append("mediafile", new Blob([]), "");

  const { status } = await fetch(url, {
    method: "POST",
    mode: "cors",
    credentials: "include",
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-language": "it-IT,it;q=0.6",
      "cache-control": "max-age=0",
      priority: "u=0, i",
      "sec-ch-ua": '"Brave";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "sec-fetch-user": "?1",
      "sec-gpc": "1",
      "upgrade-insecure-requests": "1"
      // Note: content-type is intentionally omitted — the browser sets it
      // automatically with the correct multipart boundary when using FormData
    },
    referrer: `${url}?id=${fileId}&e=T`,
    body: formData
  });

  return status === 200 ? "success" : `failed (${status})`;
};

window.deleteFolder = async ({ record }, { folderId }) => {
  record.delete({ id: folderId, type: record.Type.FOLDER });
};

window.getFilesContent = async ({ query, url }, { fileIds }) => {
  console.log("getFilesContent - File IDs:", fileIds);

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return [];
  }

  try {
    const placeholders = fileIds.map(() => "?").join(", ");

    const sql = `
    SELECT
        id,
        url
    FROM
        file
    WHERE
        id IN (${placeholders})
    `;

    const queryConfig = {
      query: sql,
      params: fileIds
    };

    const resultSet = await query.runSuiteQL.promise(queryConfig);
    const results = resultSet.asMappedResults();

    console.log(`Found ${results.length} files for IDs: ${fileIds.join(", ")}`);

    const domain = url.resolveDomain({
      hostType: url.HostType.APPLICATION
    });

    const fetchPromises = results.map(
      async ({ id: fileId, url: partialFileUrl }) => {
        const fileUrl = `https://${domain}${partialFileUrl}`;
        try {
          const response = await fetch(fileUrl);
          if (!response.ok) {
            throw new Error(
              `Failed to fetch ${fileId}: ${response.statusText}`
            );
          }
          const body = await response.text();
          console.log(`Fetched ${fileId} successfully.`);
          return {
            id: fileId,
            fileContent: body
          };
        } catch (err) {
          console.error(err);
          return {
            id: fileId,
            fileContent: null
          };
        }
      }
    );

    const fetchedResults = await Promise.all(fetchPromises);

    console.log(
      `Fetched ${
        fetchedResults.filter((f) => f.fileContent).length
      } script files successfully.`
    );

    return fetchedResults;
  } catch (error) {
    console.error("getScriptFiles error:", error);
    return [];
  }
};

window.updateNetsuiteFileContent = async (
  { runtime },
  {
    fileId,
    fileContent,
    fileName,
    folderId,
    mediaType = "JAVASCRIPT",
    target = "filesize",
    syntaxHighlighting = "T"
  }
) => {
  const { csrfToken, accountId } = window.getNetsiteParams();
  const { id, role } = runtime.getCurrentUser();

  const url = `https://${accountId}.app.netsuite.com/app/common/record/edittextmediaitem.nl?l=T&l=T`;

  const body = {
    submitter: "Save",
    mCharData: fileContent,
    _eml_nkey_: `${accountId}~${id}~${role}~N`,
    _multibtnstate_: "",
    selectedtab: "",
    l: "T",
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
    nsapiCT: String(Date.now()),
    nsbrowserenv: "istop=T",
    type: "textmediaitem",
    id: fileId,
    externalid: "",
    whence: "",
    customwhence: "",
    entryformquerystring: `id=${fileId}&e=T&l=T&target=${target}&syntaxHighlighting=${syntaxHighlighting}`,
    _csrf: csrfToken,
    target,
    sname: fileName,
    folder: folderId,
    mediaType,
    submitted: "T",
    formdisplayview: "NONE",
    _button: ""
  };

  const { status } = await fetch(url, {
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
      "sec-ch-ua": '"Brave";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "sec-fetch-user": "?1",
      "sec-gpc": "1",
      "upgrade-insecure-requests": "1"
    },
    referrer: `https://${accountId}.app.netsuite.com/app/common/record/edittextmediaitem.nl?id=${fileId}&e=T&l=T&target=${target}&syntaxHighlighting=${syntaxHighlighting}`,
    body: new URLSearchParams(body).toString()
  });

  const result = status === 200 ? "success" : `failed (${status})`;

  console.log("updateNetsuiteFileContent - Result:", result);

  return {
    fileId,
    isUpdated: status === 200
  };
};
