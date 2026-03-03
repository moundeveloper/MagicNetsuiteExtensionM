import { DOCK_STYLES } from "./styles.js";
import { initMagicNetsuiteSettings } from "../../utils/settings.js";
import { injectUI, showUI, hideUI } from "../frame/iframe.js";

const FRAME_ID = "magic-netsuite-frame";
const DOCK_ID = "magic-netsuite-dock";
const TOGGLE_ID = "magic-netsuite-toggle";

export const createDock = async () => {
  await initMagicNetsuiteSettings();

  if (document.getElementById(DOCK_ID)) return;

  const dock = document.createElement("div");
  dock.id = DOCK_ID;
  dock.style.display = "none";
  dock.style.position = "fixed";
  dock.style.top = "50%";
  dock.style.right = "0";
  dock.style.transform = "translateY(-50%)";
  dock.style.zIndex = "200000000";
  dock.style.fontFamily = "sans-serif";

  dock.innerHTML = `
    <div class="dock-trigger">
      <div class="dock-arrow">▶</div>
    </div>
    <div class="dock-content">
      <ul class="dock-list">
        <li class="dock-item">
          <span class="dock-label">🪄 Magic Netsuite</span>
          <label class="my-ext-switch">
            <input id="${TOGGLE_ID}" type="checkbox" />
            <span class="slider"></span>
          </label>
        </li>
      </ul>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = DOCK_STYLES;

  const injectAllowed = window.location.href.includes(
    "/app/setup/mainsetup.nl"
  );
  const isCustomizationPage = window.location.href.includes("sc=-90");
  const isTempTab = new URLSearchParams(window.location.search).get("tempTab") === "true";
  const route = isTempTab ? "/processing" : "";

  if (injectAllowed && isCustomizationPage) {
    dock.style.display = "block";
    injectUI(route);

    document.head.appendChild(style);
    document.body.appendChild(dock);

    const checkbox = document.getElementById(TOGGLE_ID);

    chrome.runtime.sendMessage({ type: "UI_SOURCE", source: "page" });

    const { magic_netsuite_settings: magicNetsuiteSettings } =
      (await chrome.storage.sync.get(["magic_netsuite_settings"])) || {};

    if (isTempTab || magicNetsuiteSettings.openOnCustomizationPage) {
      console.log("[initMagicNetsuiteSettings] openOnCustomizationPage (or tempTab)");
      checkbox.checked = true;
      showUI();
    } else {
      console.log("[initMagicNetsuiteSettings] !openOnCustomizationPage");
      checkbox.checked = false;
    }

    checkbox.addEventListener("change", async () => {
      if (checkbox.checked) {
        showUI();
      } else {
        hideUI();
      }
    });
  }
};
