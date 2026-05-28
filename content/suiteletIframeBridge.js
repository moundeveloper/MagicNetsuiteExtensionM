(function bridgeSuiteletIframeProxy() {
  const REQUEST_TYPE = "MAGIC_NS_SUITELET_PROXY_FETCH";
  const RESPONSE_TYPE = "MAGIC_NS_SUITELET_PROXY_FETCH_RESPONSE";

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== REQUEST_TYPE) return;

    chrome.runtime.sendMessage(
      {
        type: "NETSUITE_PROXY_FETCH",
        payload: event.data.payload
      },
      (response) => {
        window.postMessage(
          {
            type: RESPONSE_TYPE,
            id: event.data.id,
            response
          },
          window.location.origin
        );
      }
    );
  });
})();
