window.runQuickScript = async (N, { code }) => {
  const logs = []; // Array of structured log entries

  const stringifyArg = (arg) => {
    if (typeof arg === "object" && arg !== null) {
      try {
        return JSON.stringify(arg, null, 2); // pretty print objects
      } catch {
        return String(arg); // fallback
      }
    }
    return String(arg);
  };

  try {
    const fakeConsole = {
      log: (...args) =>
        logs.push({ type: "log", values: args.map(stringifyArg) }),
      warn: (...args) =>
        logs.push({ type: "warn", values: args.map(stringifyArg) }),
      error: (...args) =>
        logs.push({ type: "error", values: args.map(stringifyArg) }),
    };

    // Create a proxy for N.log that intercepts calls
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

    // Create a modified N object with the fake log
    const modifiedN = {
      ...N,
      log: fakeLog,
    };

    console.log("Modified N: ", modifiedN);

    // Destructure all keys of the modified N for easy access
    const destructuredKeys = Object.keys(modifiedN).join(", ");
    const wrappedCode = `
        "use strict";
        const { ${destructuredKeys} } = N;
        return (async () => { ${code} })();
      `;

    const asyncFn = new Function("N", "console", wrappedCode);
    await asyncFn(modifiedN, fakeConsole);
  } catch (err) {
    logs.push({ type: "error", values: ["Execution error: " + err.message] });
  }

  return logs;
};
