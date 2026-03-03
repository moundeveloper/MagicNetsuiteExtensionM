// ============================================================================
// Main Content Script Entry Point (dynamic module loader)
// ============================================================================

(async () => {
  try {
    // Construct the module URL relative to the extension root
    const moduleURL = chrome.runtime.getURL("content/content_export.js");

    // Dynamically import the module
    const contentMain = await import(moduleURL);

    // Call the module's entry function
    contentMain.initExtension();
  } catch (error) {
    console.error("[Magic Netsuite] Failed to load content module:", error);
  }
})();
