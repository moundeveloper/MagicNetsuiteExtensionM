const FRAME_ID = "magic-netsuite-frame";

export const showUI = () => {
  const iframe = document.getElementById(FRAME_ID);
  if (!iframe) return;

  iframe.style.pointerEvents = "auto";
  requestAnimationFrame(() => {
    iframe.style.opacity = "1";
    iframe.style.transform = "translateY(0)";
  });
};

export const hideUI = () => {
  const iframe = document.getElementById(FRAME_ID);
  if (!iframe) return;

  iframe.style.pointerEvents = "none";
  iframe.style.opacity = "0";
  iframe.style.transform = "translateY(20px)";
};

export const injectUI = (route = "") => {
  let iframe = document.getElementById(FRAME_ID);
  if (iframe) return;

  const baseUrl = chrome.runtime.getURL("dist/vue-ui/index.html");
  const src = route ? `${baseUrl}#${route}` : baseUrl;

  iframe = document.createElement("iframe");
  iframe.id = FRAME_ID;
  iframe.src = src;

  Object.assign(iframe.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: "100%",
    height: "100vh",
    border: "none",
    zIndex: "20000000",
    opacity: "0",
    transform: "translateY(20px)",
    transition: "opacity 0.3s ease, transform 0.3s ease",
    pointerEvents: "none"
  });

  document.body.appendChild(iframe);
};
