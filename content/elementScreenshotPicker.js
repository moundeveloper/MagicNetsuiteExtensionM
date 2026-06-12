(() => {
  if (window.__magicNetsuiteElementScreenshotPickerInstalled) return;
  window.__magicNetsuiteElementScreenshotPickerInstalled = true;

  const START_KEY = "magic_netsuite_element_screenshot_request";
  const STOP_KEY = "magic_netsuite_element_screenshot_stop";
  const DEFAULT_SHORTCUT = "ctrl+shift+s";
  const OVERLAY_ID = "magic-netsuite-element-screenshot-overlay";
  const LABEL_ID = "magic-netsuite-element-screenshot-label";
  const CAPTURE_OVERLAY_CLASS = "magic-netsuite-element-screenshot-capture";
  const CLIPBOARD_WRITE_REQUEST = "MAGIC_NETSUITE_WRITE_IMAGE_CLIPBOARD";
  const CLIPBOARD_WRITE_RESPONSE = "MAGIC_NETSUITE_WRITE_IMAGE_CLIPBOARD_RESULT";
  const FRAME_RECT_REQUEST = "MAGIC_NETSUITE_GET_EXTENSION_FRAME_RECT";
  const FRAME_RECT_RESPONSE = "MAGIC_NETSUITE_EXTENSION_FRAME_RECT";

  let active = false;
  let hoveredElement = null;
  let shortcut = DEFAULT_SHORTCUT;
  let overlay = null;
  let label = null;
  let captureOverlays = [];
  let captureOverlaySyncQueued = false;
  let captureOverlaySync = null;
  let documentCaptureListenersActive = false;

  const parseShortcut = (value) => {
    const parts = String(value || DEFAULT_SHORTCUT)
      .toLowerCase()
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean);
    return {
      key: parts[parts.length - 1] || "s",
      modifiers: parts.slice(0, -1)
    };
  };

  const matchesShortcut = (event, value) => {
    const { key, modifiers } = parseShortcut(value);
    const wantsCtrl = modifiers.includes("ctrl") || modifiers.includes("cmd") || modifiers.includes("meta");
    const ctrlMatch = wantsCtrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
    const altMatch = modifiers.includes("alt") ? event.altKey : !event.altKey;
    const shiftMatch = modifiers.includes("shift") ? event.shiftKey : !event.shiftKey;
    return ctrlMatch && altMatch && shiftMatch && event.key.toLowerCase() === key;
  };

  const requestSelection = async (source = "shortcut") => {
    try {
      await chrome.storage.local.set({
        [START_KEY]: {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          source
        }
      });
    } catch (error) {
      console.error("[Magic Netsuite] Failed to start element screenshot picker:", error);
    }
  };

  const requestStopSelection = () => {
    return chrome.storage.local.set({
      [STOP_KEY]: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }
    }).catch(() => {});
  };

  const loadShortcut = async () => {
    try {
      const result = await chrome.storage.sync.get(["magic_netsuite_settings"]);
      shortcut = result.magic_netsuite_settings?.elementScreenshotShortcut || DEFAULT_SHORTCUT;
    } catch {
      shortcut = DEFAULT_SHORTCUT;
    }
  };

  const ensureOverlay = () => {
    if (overlay && label) return;

    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    Object.assign(overlay.style, {
      position: "fixed",
      zIndex: "2147483646",
      pointerEvents: "none",
      border: "2px solid #22c55e",
      background: "transparent",
      boxShadow: "none",
      display: "none",
      boxSizing: "border-box"
    });

    label = document.createElement("div");
    label.id = LABEL_ID;
    label.textContent = "Click to copy element screenshot · Esc to cancel";
    Object.assign(label.style, {
      position: "fixed",
      zIndex: "2147483647",
      pointerEvents: "none",
      display: "none",
      padding: "5px 8px",
      borderRadius: "6px",
      background: "#0f172a",
      color: "#ffffff",
      font: "12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      boxShadow: "0 8px 24px rgba(15, 23, 42, 0.25)"
    });

    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(label);
  };

  const hideOverlay = () => {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    if (label) {
      label.remove();
      label = null;
    }
  };

  const createCaptureOverlay = (rect) => {
    const element = document.createElement("div");
    element.className = CAPTURE_OVERLAY_CLASS;
    Object.assign(element.style, {
      position: "fixed",
      left: `${Math.max(0, rect.left)}px`,
      top: `${Math.max(0, rect.top)}px`,
      width: `${Math.max(0, rect.width)}px`,
      height: `${Math.max(0, rect.height)}px`,
      zIndex: "2147483644",
      background: "transparent",
      cursor: "crosshair",
      pointerEvents: "auto"
    });

    element.addEventListener("mousemove", onMouseMove, true);
    element.addEventListener("click", onClick, true);
    document.documentElement.appendChild(element);
    return element;
  };

  const getVisibleIframeRects = () =>
    Array.from(document.querySelectorAll("iframe"))
      .map((iframe) => iframe.getBoundingClientRect())
      .map((rect) => ({
        left: Math.max(0, rect.left),
        top: Math.max(0, rect.top),
        right: Math.min(window.innerWidth, rect.right),
        bottom: Math.min(window.innerHeight, rect.bottom)
      }))
      .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);

  const rebuildCaptureOverlays = () => {
    captureOverlays.forEach((element) => element.remove());
    captureOverlays = [];

    const iframeRects = getVisibleIframeRects().sort((a, b) => a.top - b.top);
    let bands = [{ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }];

    iframeRects.forEach((hole) => {
      const nextBands = [];
      bands.forEach((band) => {
        const intersects =
          hole.left < band.right &&
          hole.right > band.left &&
          hole.top < band.bottom &&
          hole.bottom > band.top;

        if (!intersects) {
          nextBands.push(band);
          return;
        }

        if (hole.top > band.top) {
          nextBands.push({ left: band.left, top: band.top, right: band.right, bottom: hole.top });
        }
        if (hole.bottom < band.bottom) {
          nextBands.push({ left: band.left, top: hole.bottom, right: band.right, bottom: band.bottom });
        }
        if (hole.left > band.left) {
          nextBands.push({
            left: band.left,
            top: Math.max(band.top, hole.top),
            right: hole.left,
            bottom: Math.min(band.bottom, hole.bottom)
          });
        }
        if (hole.right < band.right) {
          nextBands.push({
            left: hole.right,
            top: Math.max(band.top, hole.top),
            right: band.right,
            bottom: Math.min(band.bottom, hole.bottom)
          });
        }
      });
      bands = nextBands.filter((band) => band.right > band.left && band.bottom > band.top);
    });

    captureOverlays = bands.map((band) =>
      createCaptureOverlay({
        left: band.left,
        top: band.top,
        width: band.right - band.left,
        height: band.bottom - band.top
      })
    );
  };

  const startCaptureOverlays = () => {
    captureOverlaySync = () => {
      if (!active || captureOverlaySyncQueued) return;
      captureOverlaySyncQueued = true;
      requestAnimationFrame(() => {
        captureOverlaySyncQueued = false;
        if (!active) return;
        rebuildCaptureOverlays();
      });
    };

    rebuildCaptureOverlays();
    window.addEventListener("resize", captureOverlaySync, true);
    window.addEventListener("scroll", captureOverlaySync, true);
  };

  const stopCaptureOverlays = () => {
    if (captureOverlaySync) {
      window.removeEventListener("resize", captureOverlaySync, true);
      window.removeEventListener("scroll", captureOverlaySync, true);
      captureOverlaySync = null;
    }
    captureOverlaySyncQueued = false;
    captureOverlays.forEach((element) => element.remove());
    captureOverlays = [];
  };

  const startDocumentCaptureListeners = () => {
    if (documentCaptureListenersActive) return;
    documentCaptureListenersActive = true;
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("pointermove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
  };

  const stopDocumentCaptureListeners = () => {
    if (!documentCaptureListenersActive) return;
    documentCaptureListenersActive = false;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("pointermove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
  };

  const updateOverlay = (element) => {
    if (!active || !element || element === overlay || element === label) return;
    ensureOverlay();

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      hideOverlay();
      return;
    }

    Object.assign(overlay.style, {
      display: "block",
      left: `${Math.max(0, rect.left)}px`,
      top: `${Math.max(0, rect.top)}px`,
      width: `${Math.max(1, Math.min(rect.width, window.innerWidth - rect.left))}px`,
      height: `${Math.max(1, Math.min(rect.height, window.innerHeight - rect.top))}px`
    });

    const labelTop = rect.top > 32 ? rect.top - 30 : rect.top + 8;
    Object.assign(label.style, {
      display: "block",
      left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 280))}px`,
      top: `${Math.max(8, labelTop)}px`
    });
  };

  const getDirectFrameRect = () => {
    let left = 0;
    let top = 0;
    let currentWindow = window;

    try {
      while (currentWindow !== currentWindow.top) {
        const frameElement = currentWindow.frameElement;
        if (!frameElement) return null;

        const rect = frameElement.getBoundingClientRect();
        left += rect.left;
        top += rect.top;
        currentWindow = currentWindow.parent;
      }

      return {
        left,
        top,
        width: window.innerWidth,
        height: window.innerHeight,
        viewportWidth: currentWindow.innerWidth,
        viewportHeight: currentWindow.innerHeight
      };
    } catch {
      return null;
    }
  };

  const getParentFrameRect = () =>
    new Promise((resolve, reject) => {
      const directRect = getDirectFrameRect();
      if (directRect) {
        resolve(directRect);
        return;
      }

      if (window.parent === window) {
        resolve({
          left: 0,
          top: 0,
          width: window.innerWidth,
          height: window.innerHeight,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        });
        return;
      }

      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("Unable to locate iframe on the page."));
      }, 1000);

      function onMessage(event) {
        if (
          event.data?.type !== FRAME_RECT_RESPONSE ||
          event.data.requestId !== requestId
        ) {
          return;
        }

        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        if (event.data.error) {
          reject(new Error(event.data.error));
          return;
        }
        resolve(event.data.rect);
      }

      window.addEventListener("message", onMessage);
      window.parent.postMessage({
        type: FRAME_RECT_REQUEST,
        requestId
      }, "*");
    });

  const getViewportRect = async (element) => {
    const rect = element.getBoundingClientRect();
    const frameRect = await getParentFrameRect();

    const left = Math.max(0, frameRect.left + rect.left);
    const top = Math.max(0, frameRect.top + rect.top);
    const right = Math.min(frameRect.viewportWidth, frameRect.left + rect.right);
    const bottom = Math.min(frameRect.viewportHeight, frameRect.top + rect.bottom);

    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
      viewportWidth: frameRect.viewportWidth,
      viewportHeight: frameRect.viewportHeight
    };
  };

  const dataUrlToBlob = async (dataUrl) => {
    const response = await fetch(dataUrl);
    return response.blob();
  };

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error("Unable to read screenshot blob."));
      reader.readAsDataURL(blob);
    });

  const loadImage = (dataUrl) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });

  const writeImageBlobViaParent = async (blob) => {
    if (window.parent === window) {
      throw new Error("Clipboard write is blocked in this document.");
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const dataUrl = await blobToDataUrl(blob);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("Clipboard write was blocked by the current iframe permissions policy."));
      }, 3000);

      function onMessage(event) {
        if (
          event.data?.type !== CLIPBOARD_WRITE_RESPONSE ||
          event.data.requestId !== requestId
        ) {
          return;
        }

        clearTimeout(timer);
        window.removeEventListener("message", onMessage);

        if (event.data.ok) {
          resolve();
        } else {
          reject(new Error(event.data.error || "Clipboard write failed."));
        }
      }

      window.addEventListener("message", onMessage);
      window.parent.postMessage({
        type: CLIPBOARD_WRITE_REQUEST,
        requestId,
        dataUrl
      }, "*");
    });
  };

  const writeImageBlobToClipboard = async (blob) => {
    if (window.parent !== window) {
      await writeImageBlobViaParent(blob);
      return;
    }

    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return;
    }

    throw new Error("Image clipboard write is not available in this document.");
  };

  const waitForPaint = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)));
    });

  const copyElementScreenshot = async (element) => {
    const rect = await getViewportRect(element);
    const response = await chrome.runtime.sendMessage({
      type: "CAPTURE_ELEMENT_SCREENSHOT",
      rect
    });

    if (!response?.ok || !response.dataUrl) {
      throw new Error(response?.error || "Unable to capture visible tab.");
    }

    const image = await loadImage(response.dataUrl);
    const scaleX = image.naturalWidth / rect.viewportWidth;
    const scaleY = image.naturalHeight / rect.viewportHeight;
    const cropLeft = Math.round(rect.left * scaleX);
    const cropTop = Math.round(rect.top * scaleY);
    const cropWidth = Math.max(1, Math.round(rect.width * scaleX));
    const cropHeight = Math.max(1, Math.round(rect.height * scaleY));

    const canvas = document.createElement("canvas");
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const context = canvas.getContext("2d");
    context.drawImage(
      image,
      cropLeft,
      cropTop,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Unable to render screenshot.");

    await writeImageBlobToClipboard(blob);
  };

  const showToast = (message, tone = "ok") => {
    const toast = document.createElement("div");
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "2147483647",
      padding: "8px 10px",
      borderRadius: "8px",
      background: tone === "ok" ? "#166534" : "#991b1b",
      color: "#ffffff",
      font: "12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      boxShadow: "0 10px 30px rgba(15, 23, 42, 0.25)"
    });
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  };

  const stopListeners = () => {
    active = false;
    hoveredElement = null;
    stopDocumentCaptureListeners();
    hideOverlay();
    document.removeEventListener("keydown", onPickerKeyDown, true);
  };

  const stopSelection = () => {
    stopListeners();
    stopCaptureOverlays();
  };

  const startSelection = () => {
    stopSelection();
    active = true;
    ensureOverlay();
    startCaptureOverlays();
    startDocumentCaptureListeners();
    document.addEventListener("keydown", onPickerKeyDown, true);
    showToast("Element screenshot picker enabled");
  };

  function getElementUnderCursor(x, y) {
    captureOverlays.forEach((element) => {
      element.style.pointerEvents = "none";
    });
    const elements = document.elementsFromPoint(x, y);
    captureOverlays.forEach((element) => {
      element.style.pointerEvents = "auto";
    });

    return elements.find((el) =>
      el !== overlay &&
      el !== label &&
      !el.classList?.contains(CAPTURE_OVERLAY_CLASS)
    ) || null;
  }

  function onMouseMove(event) {
    hoveredElement = getElementUnderCursor(event.clientX, event.clientY);
    updateOverlay(hoveredElement);
  }

  async function onClick(event) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const element = getElementUnderCursor(event.clientX, event.clientY);
    stopSelection();
    await requestStopSelection();

    if (!element) return;

    try {
      await waitForPaint();
      await copyElementScreenshot(element);
      showToast("Element screenshot copied to clipboard");
    } catch (error) {
      console.error("[Magic Netsuite] Element screenshot failed:", error);
      showToast(error?.message || "Element screenshot failed", "error");
    }
  }

  function onPickerKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stopSelection();
      requestStopSelection();
      showToast("Element screenshot picker cancelled");
    }
  }

  document.addEventListener("keydown", (event) => {
    if (active) return;
    if (!matchesShortcut(event, shortcut)) return;

    event.preventDefault();
    event.stopPropagation();
    requestSelection("content-shortcut");
  }, true);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes.magic_netsuite_settings) {
      shortcut = changes.magic_netsuite_settings.newValue?.elementScreenshotShortcut || DEFAULT_SHORTCUT;
    }

    if (areaName === "local" && changes[START_KEY]?.newValue) {
      startSelection();
    }

    if (areaName === "local" && changes[STOP_KEY]?.newValue) {
      stopSelection();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "START_ELEMENT_SCREENSHOT_SELECTION") return;
    requestSelection("runtime-message")
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  });

  window.addEventListener("message", (event) => {
    if (event.data?.type !== CLIPBOARD_WRITE_REQUEST) return;

    (async () => {
      try {
        const blob = await dataUrlToBlob(event.data.dataUrl);
        await writeImageBlobToClipboard(blob);
        event.source?.postMessage({
          type: CLIPBOARD_WRITE_RESPONSE,
          requestId: event.data.requestId,
          ok: true
        }, "*");
      } catch (error) {
        event.source?.postMessage({
          type: CLIPBOARD_WRITE_RESPONSE,
          requestId: event.data.requestId,
          ok: false,
          error: error?.message || String(error)
        }, "*");
      }
    })();
  });

  window.addEventListener("message", (event) => {
    if (event.data?.type !== FRAME_RECT_REQUEST) return;

    (async () => {
      try {
        const iframe = Array.from(document.querySelectorAll("iframe"))
          .find((frame) => frame.contentWindow === event.source);

        if (!iframe) return;

        const rect = iframe.getBoundingClientRect();
        const parentRect = await getParentFrameRect();
        const left = Math.max(0, parentRect.left + rect.left);
        const top = Math.max(0, parentRect.top + rect.top);
        const right = Math.min(parentRect.viewportWidth, parentRect.left + rect.right);
        const bottom = Math.min(parentRect.viewportHeight, parentRect.top + rect.bottom);

        event.source.postMessage({
          type: FRAME_RECT_RESPONSE,
          requestId: event.data.requestId,
          rect: {
            left,
            top,
            width: Math.max(1, right - left),
            height: Math.max(1, bottom - top),
            viewportWidth: parentRect.viewportWidth,
            viewportHeight: parentRect.viewportHeight
          }
        }, "*");
      } catch (error) {
        event.source?.postMessage({
          type: FRAME_RECT_RESPONSE,
          requestId: event.data.requestId,
          error: error?.message || String(error)
        }, "*");
      }
    })();
  });

  loadShortcut();
})();
