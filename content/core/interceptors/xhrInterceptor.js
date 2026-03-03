export const setupXHRInterceptor = () => {
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
      timestamp: Date.now()
    };

    chrome.runtime.sendMessage(requestData);

    this.addEventListener("readystatechange", function () {
      if (this.readyState === 4) {
        const responseData = {
          type: "xhr_response",
          url: this._url,
          status: this.status,
          responseText: this.responseText,
          responseHeaders: this.getAllResponseHeaders(),
          timestamp: Date.now()
        };

        chrome.runtime.sendMessage(responseData);
      }
    });

    return originalXHRSend.apply(this, arguments);
  };
};
