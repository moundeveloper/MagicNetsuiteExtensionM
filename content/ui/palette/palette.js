// ============================================================================
// Palette — injects the module search palette iframe on all NetSuite pages
// ============================================================================

const PALETTE_FRAME_ID = "magic-netsuite-palette";

let paletteFrame = null;
let isVisible = false;

/**
 * Inject the palette iframe into the page. No-op if already injected.
 */
const injectPalette = () => {
  if (document.getElementById(PALETTE_FRAME_ID)) return;

  const src = chrome.runtime.getURL("dist/vue-ui/palette.html");

  paletteFrame = document.createElement("iframe");
  paletteFrame.id = PALETTE_FRAME_ID;
  paletteFrame.src = src;
  paletteFrame.allow = "clipboard-read; clipboard-write";

  Object.assign(paletteFrame.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    border: "none",
    zIndex: "19000000",
    opacity: "0",
    pointerEvents: "none",
    background: "transparent"
  });

  document.body.appendChild(paletteFrame);
};

const showPalette = () => {
  if (!paletteFrame) return;
  isVisible = true;
  paletteFrame.style.opacity = "1";
  paletteFrame.style.pointerEvents = "auto";
  // Signal the Vue app to open search
  paletteFrame.contentWindow.postMessage({ type: "PALETTE_OPEN" }, "*");
};

const hidePalette = () => {
  if (!paletteFrame) return;
  isVisible = false;
  paletteFrame.style.opacity = "0";
  paletteFrame.style.pointerEvents = "none";
  window.focus();
};

const togglePalette = () => {
  if (isVisible) {
    // Iframe already visible — let Vue app decide context (open sidebar search or close palette)
    paletteFrame.contentWindow.postMessage({ type: "PALETTE_OPEN" }, "*");
  } else {
    showPalette();
  }
};

/**
 * Parse a shortcut string like "ctrl+m" into modifiers + key.
 */
const parseShortcut = (shortcut) => {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  return { key, modifiers };
};

/**
 * Set up keyboard listener for the palette shortcut.
 * Reads and watches chrome.storage.sync for the modulesSearch setting.
 */
export const createPalette = async () => {
  injectPalette();

  // Load current shortcut from settings
  let modulesSearchShortcut = "ctrl+m";

  try {
    const result = await chrome.storage.sync.get(["magic_netsuite_settings"]);
    if (result.magic_netsuite_settings?.modulesSearch) {
      modulesSearchShortcut = result.magic_netsuite_settings.modulesSearch;
    }
  } catch {
    // use default
  }

  // Watch for settings changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.magic_netsuite_settings?.newValue?.modulesSearch) {
      modulesSearchShortcut = changes.magic_netsuite_settings.newValue.modulesSearch;
    }
  });

  // Keyboard handler on the NetSuite page
  document.addEventListener("keydown", (e) => {
    const { key, modifiers } = parseShortcut(modulesSearchShortcut);

    const ctrlMatch = modifiers.includes("ctrl") ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
    const altMatch = modifiers.includes("alt") ? e.altKey : !e.altKey;
    const shiftMatch = modifiers.includes("shift") ? e.shiftKey : !e.shiftKey;
    const keyMatch = e.key.toLowerCase() === key;

    if (ctrlMatch && altMatch && shiftMatch && keyMatch) {
      // Don't fire if user is typing in an input (except when palette is already open)
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isInput = ["input", "textarea", "select"].includes(tag) ||
        document.activeElement?.isContentEditable;

      if (isInput && !isVisible) return;

      e.preventDefault();
      e.stopPropagation();
      togglePalette();
    }
  });

  // Listen for PALETTE_CLOSE message from the palette iframe
  window.addEventListener("message", (e) => {
    if (e.data?.type === "PALETTE_CLOSE") {
      hidePalette();
    }
  });
};
