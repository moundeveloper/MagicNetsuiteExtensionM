export const initMagicNetsuiteSettings = async () => {
  const checkSettings = await chrome.storage.sync.get([
    "magic_netsuite_settings"
  ]);

  console.log("[initMagicNetsuiteSettings] result", checkSettings);

  if (checkSettings.magic_netsuite_settings) {
    console.log("[initMagicNetsuiteSettings] Settings already exist");
    return;
  }

  const settings = {
    extensionToggle: "Alt+Shift+U",
    drawerOpen: "ctrl+k",
    modulesSearch: "ctrl+m",
    elementScreenshotShortcut: "ctrl+shift+s",
    openOnCustomizationPage: true,
    dashboardPreviewEnabled: false
  };

  console.log("[initMagicNetsuiteSettings] Settings created");
  await chrome.storage.sync.set({ magic_netsuite_settings: settings });
};
