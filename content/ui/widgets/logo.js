const LOGO_HTML = `
<svg id="magic-netsuite-logo" height="1.5rem" viewBox="0 0 231 189" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M101.121 0.28651C54.6933 2.26513 15.4319 12.9936 3.78105 26.8879C0.967244 30.2735 0.0439656 32.5599 0 36.2534C0 38.6717 0.263794 39.8588 1.14311 41.7495C6.94657 54.1049 32.2708 64.4816 69.2459 69.626C82.4356 71.4727 86.6563 71.8685 100.242 72.572C114.574 73.3194 136.601 72.7039 150.143 71.1649C182.457 67.6034 206.331 60.9201 220.532 51.5986C224.708 48.8286 228.973 44.2118 230.116 41.1339C234.908 28.251 220.092 16.5551 188.613 8.33288C164.431 2.04528 131.501 -0.988598 101.121 0.28651ZM127.5 19.7649C138.624 20.2925 143.812 20.7762 152.781 22.2272C170.675 25.1291 182.721 29.7899 184.7 34.5825C185.579 36.6051 185.227 37.8363 183.337 39.9468C178.413 45.355 161.31 50.1476 138.931 52.3901C130.05 53.2695 99.0985 53.1376 90.1296 52.1702C64.9372 49.4002 48.5381 44.0799 45.9441 37.7923C41.5036 27.1078 83.7985 17.7423 127.5 19.7649Z" fill="white"/>
  <path d="M49.0657 78.7715C48.5821 81.9813 46.8674 93.2374 45.2846 103.746C41.6355 128.017 38.7338 147.188 37.5467 154.706C36.4036 161.961 36.5355 164.072 38.47 167.106C42.3389 173.13 49.5493 177.614 61.7718 181.572C90.3934 190.937 134.623 191.509 164.871 182.935C178.413 179.109 187.689 173.877 191.91 167.721C194.196 164.424 194.372 162.753 193.317 156.245C192.394 150.749 191.558 145.341 187.953 121.554C184.084 95.9635 180.523 73.2753 180.347 73.0995C180.259 73.0115 176.918 73.5392 172.961 74.2866C163.113 76.0894 150.363 77.6723 139.107 78.4637C128.248 79.2112 106.573 79.3431 95.4934 78.6836C82.2158 77.8921 64.6295 75.7376 54.8252 73.6271C49.6812 72.5718 50.1648 72.1761 49.0657 78.7715ZM103.979 102.691C106.045 105.373 109.387 109.726 111.453 112.408C113.519 115.046 118.663 121.729 122.884 127.226L130.578 137.251L130.71 117.42L130.798 97.5903H148.824V165.743H140.119C131.633 165.743 131.369 165.699 130.446 164.731C129.611 163.808 102.044 128.369 100.725 126.434C100.154 125.643 100.066 127.973 100.066 145.605L100.022 165.743H81.9959V97.5903L91.0968 97.6783L100.242 97.8102L103.979 102.691Z" fill="white"/>
</svg>
`;

const DASHBOARD_BUTTON_ID = "magic-netsuite-dashboard-preview";
const DASHBOARD_BUTTON_SLOT_ID = "magic-netsuite-dashboard-preview-slot";
let dashboardPreviewEnabled = false;

const sendRuntimeMessage = (message) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });

const openDashboard = async (button) => {
  button.disabled = true;
  try {
    const response = await sendRuntimeMessage({ type: "OPEN_DASHBOARD_PREVIEW" });
    if (!response?.ok) {
      throw new Error(response?.error || "Could not open dashboard preview");
    }
  } catch (error) {
    console.error("[Magic Netsuite] Dashboard preview failed", error);
    button.title = error.message;
  } finally {
    button.disabled = false;
  }
};

const addDashboardButton = (menuItemSpan) => {
  if (!dashboardPreviewEnabled) {
    document.getElementById(DASHBOARD_BUTTON_SLOT_ID)?.remove();
    return;
  }
  if (document.getElementById(DASHBOARD_BUTTON_SLOT_ID)) return;

  const customizationMenuItem = menuItemSpan.closest(
    'div[data-widget="MenuItem"][data-automation-id="-90"]'
  );
  if (!customizationMenuItem?.parentElement) return;

  // Keep this outside NetSuite's Customization MenuItem. Putting it inside the
  // item lets the menu's hit area and event handlers swallow the button click.
  document.getElementById(DASHBOARD_BUTTON_ID)?.remove();

  const slot = document.createElement("div");
  slot.id = DASHBOARD_BUTTON_SLOT_ID;
  Object.assign(slot.style, {
    alignSelf: "stretch",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
    padding: "0 6px",
    position: "relative",
    zIndex: "200000002",
    pointerEvents: "auto"
  });

  const button = document.createElement("button");
  button.id = DASHBOARD_BUTTON_ID;
  button.type = "button";
  button.title = "Open Magic NetSuite dashboard";
  button.setAttribute("aria-label", "Open Magic NetSuite dashboard");
  button.textContent = "↗";
  Object.assign(button.style, {
    width: "28px",
    height: "28px",
    border: "1px solid rgba(255,255,255,.35)",
    borderRadius: "6px",
    background: "rgba(255,255,255,.08)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "17px",
    lineHeight: "24px",
    position: "relative",
    zIndex: "1",
    pointerEvents: "auto"
  });

  for (const eventName of ["pointerdown", "mousedown"]) {
    button.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    void openDashboard(button);
  });

  slot.appendChild(button);
  customizationMenuItem.insertAdjacentElement("afterend", slot);
};

const addLogo = () => {
  const menuItemSpan = document.querySelector(
    'div[data-widget="MenuItem"][data-automation-id="-90"] a span'
  );

  if (menuItemSpan && !menuItemSpan.querySelector("#magic-netsuite-logo")) {
    menuItemSpan.insertAdjacentHTML("afterbegin", LOGO_HTML);

    menuItemSpan.style.display = "flex";
    menuItemSpan.style.alignItems = "center";
    menuItemSpan.style.gap = "0.5rem";
  }

  if (menuItemSpan) addDashboardButton(menuItemSpan);
};

export const initUIWidgets = async () => {
  const stored = await chrome.storage.sync.get(["magic_netsuite_settings"]);
  dashboardPreviewEnabled =
    stored.magic_netsuite_settings?.dashboardPreviewEnabled === true;

  const menuContainer =
    document.querySelector('div[data-widget="Menu"]') || document.body;

  const observer = new MutationObserver(addLogo);
  observer.observe(menuContainer, { childList: true, subtree: true });

  addLogo();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes.magic_netsuite_settings) return;
    dashboardPreviewEnabled =
      changes.magic_netsuite_settings.newValue?.dashboardPreviewEnabled ===
      true;
    if (!dashboardPreviewEnabled) {
      document.getElementById(DASHBOARD_BUTTON_SLOT_ID)?.remove();
    } else {
      addLogo();
    }
  });
};
