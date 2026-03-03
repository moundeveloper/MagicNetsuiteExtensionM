window.getRootFolders = async ({ query }) => {
  const rootFolders = query
    .runSuiteQL({
      query: `
        SELECT id, name
        FROM MediaItemFolder
        WHERE IsTopLevel = 'T'
        `,
    })
    .asMappedResults();
  return rootFolders;
};

window.createFolder = async ({}, { folderName, parentFolderId, csrfToken }) => {
  const baseUrl =
    "https://1964539.app.netsuite.com/app/common/media/mediaitemfolder.nl";

  const timestamp = Date.now();
  const cmid = `${timestamp}_${Math.floor(Math.random() * 100000)}`;

  // Build body as raw string to match exact encoding
  const body = `submitnew=Save+%26+New&name=${encodeURIComponent(
    folderName
  )}&parent=${parentFolderId}&inpt_foldertype=Documents+and+Files&foldertype=DEFAULT&description=&inpt_class=+&class=&inpt_department=+&department=&inpt_location=+&location=&inpt_subsidiary=+&subsidiary=&inpt_group=+&group=&_eml_nkey_=1964539%7E56%7E3%7EN&_multibtnstate_=EDIT_MEDIAITEMFOLDER%3Asubmitter%3Asubmitnew&selectedtab=&nsapiPI=&nsapiSR=&nsapiVF=&nsapiFC=&nsapiPS=&nsapiVI=&nsapiVD=&nsapiPD=&nsapiVL=&nsapiRC=&nsapiLI=&nsapiLC=&nsapiCT=${timestamp}&nsbrowserenv=istop%3DT&type=filecabinet&id=&externalid=&whence=%2Fapp%2Fcommon%2Fmedia%2Fmediaitemfolders.nl%3Ffolder%3D${parentFolderId}%26cmid%3D${cmid}&customwhence=&entryformquerystring=parent%3D${parentFolderId}&_csrf=${encodeURIComponent(
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
        "upgrade-insecure-requests": "1",
      },
      referrer: `https://1964539.app.netsuite.com/app/common/media/mediaitemfolder.nl?parent=${parentFolderId}`,
      body: body,
      credentials: "include",
      mode: "cors",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.text();
    console.log("Folder created successfully", result);
    return result;
  } catch (error) {
    console.error("Error creating folder:", error);
    throw error;
  }
};
