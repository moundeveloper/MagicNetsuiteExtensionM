import{DOCK_STYLES as u}from"./styles.js";import{initMagicNetsuiteSettings as p}from"../../utils/settings.js";import{injectUI as a,showUI as s,hideUI as h}from"../frame/iframe.js";const y="magic-netsuite-frame",c="magic-netsuite-dock",l="magic-netsuite-toggle",k=async()=>{if(await p(),document.getElementById(c))return;const e=document.createElement("div");e.id=c,e.style.display="none",e.style.position="fixed",e.style.top="50%",e.style.right="0",e.style.transform="translateY(-50%)",e.style.zIndex="200000000",e.style.fontFamily="sans-serif",e.innerHTML=`
    <div class="dock-trigger">
      <div class="dock-arrow">▶</div>
    </div>
    <div class="dock-content">
      <ul class="dock-list">
        <li class="dock-item">
          <span class="dock-label">🪄 Magic Netsuite</span>
          <label class="my-ext-switch">
            <input id="${l}" type="checkbox" />
            <span class="slider"></span>
          </label>
        </li>
      </ul>
    </div>
  `;const n=document.createElement("style");n.textContent=u;const d=window.location.href.includes("/app/setup/mainsetup.nl"),r=window.location.href.includes("sc=-90"),m=new URL(window.location.href).searchParams.has("magicDashboardEnabler");if(d&&r){if(m){a("/processing",{executionSurface:!0}),s(),chrome.runtime.sendMessage({type:"UI_SOURCE",source:"page"});const i=document.getElementById(y),o=()=>{chrome.runtime.sendMessage({type:"DASHBOARD_ENABLER_READY",sessionId:new URL(window.location.href).searchParams.get("magicDashboardEnabler")})};i?i.addEventListener("load",o,{once:!0}):o();return}e.style.display="block",a(),document.head.appendChild(n),document.body.appendChild(e);const t=document.getElementById(l);chrome.runtime.sendMessage({type:"UI_SOURCE",source:"page"});const{magic_netsuite_settings:g}=await chrome.storage.sync.get(["magic_netsuite_settings"])||{};g.openOnCustomizationPage?(console.log("[initMagicNetsuiteSettings] openOnCustomizationPage"),t.checked=!0,s()):(console.log("[initMagicNetsuiteSettings] !openOnCustomizationPage"),t.checked=!1),t.addEventListener("change",async()=>{t.checked?s():h()})}};export{k as createDock};
