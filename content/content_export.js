// ============================================================================
// Main Content Script Entry Point
// ============================================================================

import { injectScripts } from "./core/injection/scriptInjector.js";
import { INJECTABLE_SCRIPTS } from "./core/injection/scripts.js";
import { setupMessageListener } from "./core/messaging/messageListener.js";
import { setupXHRInterceptor } from "./core/interceptors/xhrInterceptor.js";
import { setupFetchInterceptor } from "./core/interceptors/fetchInterceptor.js";
import { createDock } from "./ui/dock/dock.js";
import { initUIWidgets } from "./ui/widgets/logo.js";
import { setupKeyboardShortcuts } from "./keyboard/shortcuts.js";

// ============================================================================
// Initialize Extension
// ============================================================================

export const initExtension = async () => {
  try {
    console.log("[Magic Netsuite] Initializing...");

    // Inject page scripts
    injectScripts(INJECTABLE_SCRIPTS);

    // Setup messaging system
    setupMessageListener();

    // Setup interceptors for API monitoring
    setupXHRInterceptor();
    setupFetchInterceptor();

    // Initialize UI components
    initUIWidgets();
    await createDock();

    // Setup keyboard shortcuts
    setupKeyboardShortcuts();

    console.log("[Magic Netsuite] Initialization complete");
  } catch (error) {
    console.error("[Magic Netsuite] Initialization error:", error);
  }
};
