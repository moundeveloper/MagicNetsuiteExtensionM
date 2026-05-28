(function patchSuiteletIframeRequests() {
  const EMBED_PARAMS = {
    ifrmcntnr: "T",
    popup: "T",
    whence: ""
  };
  const REQUEST_TYPE = "MAGIC_NS_SUITELET_PROXY_FETCH";
  const RESPONSE_TYPE = "MAGIC_NS_SUITELET_PROXY_FETCH_RESPONSE";
  const PROXY_TIMEOUT_MS = 45000;

  const isFramed = window.top !== window;
  const currentParams = new URLSearchParams(window.location.search);
  const isEmbeddedSuitelet = currentParams.get("ifrmcntnr") === "T";

  if (!isFramed || !isEmbeddedSuitelet) return;

  const shouldPatchUrl = (value) => {
    try {
      const url = new URL(String(value), window.location.href);
      return (
        url.origin === window.location.origin &&
        (
          url.pathname === "/app/site/hosting/scriptlet.nl" ||
          url.pathname === "/app/common/scripting/nlapijsonhandler.nl"
        )
      );
    } catch {
      return false;
    }
  };

  const withEmbedParams = (value) => {
    try {
      const url = new URL(String(value), window.location.href);
      if (!shouldPatchUrl(url.href)) return value;

      Object.entries(EMBED_PARAMS).forEach(([key, paramValue]) => {
        if (!url.searchParams.has(key)) url.searchParams.set(key, paramValue);
      });

      return url.href;
    } catch {
      return value;
    }
  };

  let proxyId = 0;
  const pendingProxyRequests = new Map();

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== RESPONSE_TYPE) return;

    const pending = pendingProxyRequests.get(event.data.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    pendingProxyRequests.delete(event.data.id);
    pending.resolve(event.data.response);
  });

  const proxyRequest = (payload) =>
    new Promise((resolve, reject) => {
      const id = `suitelet-proxy-${Date.now()}-${++proxyId}`;
      const timeout = setTimeout(() => {
        pendingProxyRequests.delete(id);
        reject(new Error("Suitelet proxy request timed out."));
      }, PROXY_TIMEOUT_MS);

      pendingProxyRequests.set(id, { resolve, timeout });
      window.postMessage({ type: REQUEST_TYPE, id, payload }, window.location.origin);
    });

  const canProxyBody = (body) =>
    body == null ||
    typeof body === "string" ||
    body instanceof URLSearchParams;

  const normalizeProxyBody = (body) => {
    if (body instanceof URLSearchParams) return body.toString();
    return body;
  };

  const patchForm = (form) => {
    if (!(form instanceof HTMLFormElement)) return;
    const action = form.getAttribute("action") || window.location.href;
    if (shouldPatchUrl(action)) form.setAttribute("action", withEmbedParams(action));
  };

  const patchForms = () => {
    document.querySelectorAll("form").forEach(patchForm);
  };

  document.addEventListener(
    "submit",
    (event) => {
      patchForm(event.target);
    },
    true
  );

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function patchedFetch(input, init = {}) {
      const inputUrl = input instanceof Request ? input.url : input;

      if (!shouldPatchUrl(inputUrl)) {
        return originalFetch.call(this, input, init);
      }

      const targetUrl = withEmbedParams(inputUrl);
      const method = init.method || (input instanceof Request ? input.method : "GET");
      const body = init.body ?? (input instanceof Request ? null : undefined);

      if (!canProxyBody(body)) {
        return originalFetch.call(this, targetUrl, init);
      }

      const headers = {};
      new Headers(init.headers || (input instanceof Request ? input.headers : undefined)).forEach(
        (value, key) => {
          headers[key] = value;
        }
      );

      const response = await proxyRequest({
        url: targetUrl,
        method,
        headers,
        body: normalizeProxyBody(body)
      });

      if (!response?.ok) throw new TypeError(response?.error || "Suitelet proxy request failed.");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    };
  }

  const NativeXMLHttpRequest = window.XMLHttpRequest;

  function SuiteletProxyXMLHttpRequest() {
    this._native = new NativeXMLHttpRequest();
    this._listeners = {};
    this._requestHeaders = {};
    this._responseHeaders = {};
    this._proxy = false;
    this._aborted = false;
    this._method = "GET";
    this._url = "";
    this._async = true;
    this._readyState = SuiteletProxyXMLHttpRequest.UNSENT;
    this._status = 0;
    this._statusText = "";
    this._responseText = "";
    this._response = "";
    this._responseURL = "";

    ["readystatechange", "load", "error", "abort", "loadend", "timeout"].forEach((type) => {
      this._native.addEventListener(type, (event) => {
        this._emit(type, event);
      });
    });
  }

  SuiteletProxyXMLHttpRequest.UNSENT = 0;
  SuiteletProxyXMLHttpRequest.OPENED = 1;
  SuiteletProxyXMLHttpRequest.HEADERS_RECEIVED = 2;
  SuiteletProxyXMLHttpRequest.LOADING = 3;
  SuiteletProxyXMLHttpRequest.DONE = 4;

  Object.assign(SuiteletProxyXMLHttpRequest.prototype, {
    UNSENT: 0,
    OPENED: 1,
    HEADERS_RECEIVED: 2,
    LOADING: 3,
    DONE: 4,

    open(method, url, async = true, user, password) {
      const targetUrl = withEmbedParams(url);
      this._proxy = shouldPatchUrl(targetUrl) && async !== false;
      this._method = method;
      this._url = targetUrl;
      this._async = async;
      this._aborted = false;

      if (!this._proxy) {
        return this._native.open(method, targetUrl, async, user, password);
      }

      this._setReadyState(SuiteletProxyXMLHttpRequest.OPENED);
      return undefined;
    },

    setRequestHeader(name, value) {
      if (!this._proxy) return this._native.setRequestHeader(name, value);
      this._requestHeaders[name] = value;
      return undefined;
    },

    async send(body = null) {
      if (!this._proxy) return this._native.send(body);

      if (!canProxyBody(body)) {
        this._proxy = false;
        this._native.open(this._method, this._url, this._async);
        Object.entries(this._requestHeaders).forEach(([name, value]) => {
          this._native.setRequestHeader(name, value);
        });
        return this._native.send(body);
      }

      try {
        const response = await proxyRequest({
          url: this._url,
          method: this._method,
          headers: this._requestHeaders,
          body: normalizeProxyBody(body)
        });

        if (this._aborted) return;
        if (!response?.ok) throw new Error(response?.error || "Suitelet proxy request failed.");

        this._status = response.status;
        this._statusText = response.statusText || "";
        this._responseHeaders = response.headers || {};
        this._responseText = response.body || "";
        this._response = this.responseType && this.responseType !== "text" ? this._response : this._responseText;
        this._responseURL = response.url || this._url;

        this._setReadyState(SuiteletProxyXMLHttpRequest.HEADERS_RECEIVED);
        this._setReadyState(SuiteletProxyXMLHttpRequest.LOADING);
        this._setReadyState(SuiteletProxyXMLHttpRequest.DONE);
        this._emit("load");
        this._emit("loadend");
      } catch (error) {
        if (this._aborted) return;
        this._status = 0;
        this._statusText = error?.message || "Suitelet proxy request failed.";
        this._setReadyState(SuiteletProxyXMLHttpRequest.DONE);
        this._emit("error");
        this._emit("loadend");
      }
    },

    abort() {
      if (!this._proxy) return this._native.abort();
      this._aborted = true;
      this._setReadyState(SuiteletProxyXMLHttpRequest.DONE);
      this._emit("abort");
      this._emit("loadend");
      return undefined;
    },

    addEventListener(type, listener) {
      if (!this._listeners[type]) this._listeners[type] = new Set();
      this._listeners[type].add(listener);
    },

    removeEventListener(type, listener) {
      this._listeners[type]?.delete(listener);
    },

    getResponseHeader(name) {
      if (!this._proxy) return this._native.getResponseHeader(name);
      const headerKey = Object.keys(this._responseHeaders).find(
        (key) => key.toLowerCase() === String(name).toLowerCase()
      );
      return headerKey ? this._responseHeaders[headerKey] : null;
    },

    getAllResponseHeaders() {
      if (!this._proxy) return this._native.getAllResponseHeaders();
      return Object.entries(this._responseHeaders)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\r\n");
    },

    overrideMimeType(mimeType) {
      if (!this._proxy) return this._native.overrideMimeType(mimeType);
      return undefined;
    },

    _setReadyState(readyState) {
      this._readyState = readyState;
      this._emit("readystatechange");
    },

    _emit(type, nativeEvent) {
      const event = nativeEvent || new Event(type);

      if (typeof this[`on${type}`] === "function") {
        this[`on${type}`].call(this, event);
      }

      this._listeners[type]?.forEach((listener) => {
        if (typeof listener === "function") {
          listener.call(this, event);
        } else if (typeof listener?.handleEvent === "function") {
          listener.handleEvent(event);
        }
      });
    }
  });

  [
    "readyState",
    "status",
    "statusText",
    "responseText",
    "response",
    "responseURL",
    "upload"
  ].forEach((property) => {
    Object.defineProperty(SuiteletProxyXMLHttpRequest.prototype, property, {
      get() {
        if (!this._proxy) return this._native[property];
        return this[`_${property}`];
      }
    });
  });

  ["timeout", "withCredentials", "responseType"].forEach((property) => {
    Object.defineProperty(SuiteletProxyXMLHttpRequest.prototype, property, {
      get() {
        return this._proxy ? this[`_${property}`] : this._native[property];
      },
      set(value) {
        this[`_${property}`] = value;
        if (!this._proxy) this._native[property] = value;
      }
    });
  });

  ["onreadystatechange", "onload", "onerror", "onabort", "onloadend", "ontimeout"].forEach(
    (property) => {
      Object.defineProperty(SuiteletProxyXMLHttpRequest.prototype, property, {
        get() {
          return this[`_${property}`];
        },
        set(value) {
          this[`_${property}`] = value;
        }
      });
    }
  );

  window.XMLHttpRequest = SuiteletProxyXMLHttpRequest;

  patchForms();
  new MutationObserver(patchForms).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
