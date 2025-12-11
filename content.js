const injectScript = (file) => {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL(file);

  script.onload = function () {
    this.remove();
  };

  (document.head || document.documentElement).appendChild(script);
};

(async function () {
  try {
    /* const { logStuff } = await import(chrome.runtime.getURL("./utils.js")); */
    injectScript("scripts.js");
    injectScript("customRecords.js");
    injectScript("sandboxCode.js");
    injectScript("netsuiteApi.js");
    injectScript("exportRecord.js");
  } catch (error) {
    console.log("Error", error);
  }
})();
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("Message from popup:", msg);

  // Create the event for the page
  const event = new CustomEvent("fromExtension", { detail: msg });

  // Listen once for the response from the page
  const handleResponse = (e) => {
    console.log("Got response from page:", e);
    sendResponse(e.detail); // send it back to the popup
    window.removeEventListener("toExtension", handleResponse);
  };

  window.addEventListener("toExtension", handleResponse);

  // Dispatch the request to the page
  window.dispatchEvent(event);

  return true; // keep sendResponse alive for async
});
// Intercept XMLHttpRequest
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;
const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

XMLHttpRequest.prototype.open = function (method, url) {
  this._method = method;
  this._url = url;
  this._requestHeaders = {};
  return originalXHROpen.apply(this, arguments);
};

XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
  this._requestHeaders[header] = value;
  return originalXHRSetRequestHeader.apply(this, arguments);
};

XMLHttpRequest.prototype.send = function (body) {
  const requestData = {
    type: "xhr_request",
    url: this._url,
    method: this._method,
    headers: this._requestHeaders,
    body: body,
    timestamp: Date.now(),
  };

  // Send request data to background script
  chrome.runtime.sendMessage(requestData);

  // Capture response
  this.addEventListener("readystatechange", function () {
    if (this.readyState === 4) {
      const responseData = {
        type: "xhr_response",
        url: this._url,
        status: this.status,
        responseText: this.responseText,
        responseHeaders: this.getAllResponseHeaders(),
        timestamp: Date.now(),
      };

      // Send response data to background script
      chrome.runtime.sendMessage(responseData);
    }
  });

  return originalXHRSend.apply(this, arguments);
};

// Intercept Fetch API
const originalFetch = window.fetch;
window.fetch = function (...args) {
  const requestInfo = args[0];
  const requestInit = args[1] || {};

  const requestData = {
    type: "fetch_request",
    url: requestInfo,
    method: requestInit.method || "GET",
    headers: requestInit.headers
      ? Object.fromEntries(new Headers(requestInit.headers).entries())
      : {},
    body: requestInit.body,
    timestamp: Date.now(),
  };

  // Send request data to background script
  chrome.runtime.sendMessage(requestData);

  return originalFetch.apply(this, args).then((response) => {
    // Clone response to read body without consuming it
    response
      .clone()
      .text()
      .then((body) => {
        const responseData = {
          type: "fetch_response",
          url: requestInfo,
          status: response.status,
          responseBody: body,
          responseHeaders: Object.fromEntries(response.headers.entries()),
          timestamp: Date.now(),
        };

        // Send response data to background script
        chrome.runtime.sendMessage(responseData);
      });
    return response;
  });
};
