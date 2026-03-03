let keysPressed = {};

export const setupKeyboardShortcuts = () => {
  document.addEventListener("keydown", (e) => {
    keysPressed[e.key.toLowerCase()] = true;

    const isNetSuiteByUrl = location.hostname.includes("netsuite.com");
    if (!isNetSuiteByUrl) return;

    // Check if both "c" and "s" are pressed
    if (keysPressed["c"] && keysPressed["s"]) {
      chrome.runtime.sendMessage({ type: "OPEN_MAIN_SETUP" });
    }
  });

  document.addEventListener("keyup", (e) => {
    keysPressed[e.key.toLowerCase()] = false;
  });
};
