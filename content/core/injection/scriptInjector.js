export const injectScript = (file) => {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL(file);

  script.onload = function () {
    this.remove();
  };

  (document.head || document.documentElement).appendChild(script);
};

export const injectScripts = (scripts) => {
  scripts.forEach((script) => injectScript(script));
};
