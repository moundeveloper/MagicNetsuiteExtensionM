export const setupFetchInterceptor = () => {
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
      timestamp: Date.now()
    };

    chrome.runtime.sendMessage(requestData);

    return originalFetch.apply(this, args).then((response) => {
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
            timestamp: Date.now()
          };

          chrome.runtime.sendMessage(responseData);
        });
      return response;
    });
  };
};
