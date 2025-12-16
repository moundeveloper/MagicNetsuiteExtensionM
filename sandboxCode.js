// Non-blocking runQuickScript - runs on main thread but yields to UI
window.runQuickScript = async (N, { code }) => {
  const logs = [];

  const stringifyArg = (arg) => {
    if (typeof arg === "object" && arg !== null) {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  };

  // Helper to yield control back to the browser
  const yieldToMain = () => {
    return new Promise((resolve) => setTimeout(resolve, 0));
  };

  try {
    const fakeConsole = {
      log: (...args) => {
        logs.push({ type: "log", values: args.map(stringifyArg) });
        return yieldToMain(); // Yield after each log
      },
      warn: (...args) => {
        logs.push({ type: "warn", values: args.map(stringifyArg) });
        return yieldToMain();
      },
      error: (...args) => {
        logs.push({ type: "error", values: args.map(stringifyArg) });
        return yieldToMain();
      },
    };

    const originalLog = N.log;
    const fakeLog = {
      LOG_LEVELS: originalLog?.LOG_LEVELS || [
        "DEBUG",
        "AUDIT",
        "ERROR",
        "EMERGENCY",
      ],
      emergency: (...args) => {
        logs.push({ type: "error", values: args.map(stringifyArg) });
      },
      debug: (...args) => {
        logs.push({ type: "log", values: args.map(stringifyArg) });
      },
      audit: (...args) => {
        logs.push({ type: "log", values: args.map(stringifyArg) });
      },
      error: (...args) => {
        logs.push({ type: "error", values: args.map(stringifyArg) });
      },
    };

    const modifiedN = {
      ...N,
      log: fakeLog,
    };

    const destructuredKeys = Object.keys(modifiedN).join(", ");
    const wrappedCode = `
        "use strict";
        const { ${destructuredKeys} } = N;
        return (async () => { ${code} })();
      `;

    const asyncFn = new Function("N", "console", wrappedCode);

    // Yield before executing to allow UI update
    await yieldToMain();

    await asyncFn(modifiedN, fakeConsole);

    // Yield after execution
    await yieldToMain();
  } catch (err) {
    logs.push({ type: "error", values: ["Execution error: " + err] });
  }

  return logs;
};
