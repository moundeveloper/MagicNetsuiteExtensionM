// Streaming-enabled runQuickScript
window.runQuickScript = async (N, { code, requestId, mode = "normal" }) => {
  console.log("[runQuickScript] requestId", requestId);
  const logs = [];
  const isStreaming = mode === "stream";

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

  // ============================================================================
  // Emit Functions
  // ============================================================================

  const emitLog = (requestId, entry) => {
    console.log("[emitLog] requestId", requestId);
    window.postMessage(
      {
        type: "TO_EXTENSION",
        payload: {
          requestId,
          event: "log",
          data: entry,
          timestamp: Date.now()
        }
      },
      "*"
    );
  };

  const emitProgress = (requestId, progress) => {
    if (!isStreaming) return;

    window.postMessage(
      {
        type: "TO_EXTENSION",
        payload: {
          requestId,
          event: "progress",
          data: progress,
          timestamp: Date.now()
        }
      },
      "*"
    );
  };

  const emitStreamChunk = (requestId, chunk) => {
    if (!isStreaming) return;
    console.log("[emitStreamChunk] streaming this chunk", requestId);
    window.postMessage(
      {
        type: "TO_EXTENSION",
        payload: {
          requestId,
          event: "chunk",
          data: chunk,
          timestamp: Date.now()
        }
      },
      "*"
    );
  };

  const emitComplete = (requestId, result) => {
    window.postMessage(
      {
        type: "TO_EXTENSION",
        payload: isStreaming
          ? {
              requestId,
              type: "STREAM_END",
              result,
              logs,
              timestamp: Date.now()
            }
          : {
              requestId,
              event: "done",
              result,
              logs,
              timestamp: Date.now()
            }
      },
      "*"
    );
  };

  const emitError = (requestId, error) => {
    window.postMessage(
      {
        type: "TO_EXTENSION",
        payload: isStreaming
          ? {
              requestId,
              type: "STREAM_ERROR",
              error: error.toString(),
              timestamp: Date.now()
            }
          : {
              requestId,
              event: "error",
              error: error.toString(),
              timestamp: Date.now()
            }
      },
      "*"
    );
  };

  // Helper to yield control back to the browser
  const yieldToMain = () => {
    return new Promise((resolve) => setTimeout(resolve, 0));
  };

  // ============================================================================
  // Streaming-aware Console
  // ============================================================================

  try {
    const fakeConsole = {
      log: (...args) => {
        const entry = {
          type: "log",
          values: args.map(stringifyArg)
        };

        if (isStreaming) {
          emitStreamChunk(requestId, entry);
        } else {
          emitLog(requestId, entry);
        }
      },
      warn: (...args) => {
        const entry = {
          type: "warn",
          values: args.map(stringifyArg)
        };

        if (isStreaming) {
          emitStreamChunk(requestId, entry);
        } else {
          emitLog(requestId, entry);
        }
      },
      error: (...args) => {
        const entry = {
          type: "error",
          values: args.map(stringifyArg)
        };

        if (isStreaming) {
          emitStreamChunk(requestId, entry);
        } else {
          emitLog(requestId, entry);
        }
      },
      // Add streaming-specific method
      stream: (data) => {
        if (isStreaming) {
          emitStreamChunk(requestId, {
            type: "data",
            value: stringifyArg(data)
          });
        }
      }
    };

    // ============================================================================
    // Enhanced N.log for Streaming
    // ============================================================================

    const originalLog = N.log;
    const fakeLog = {
      LOG_LEVELS: originalLog?.LOG_LEVELS || [
        "DEBUG",
        "AUDIT",
        "ERROR",
        "EMERGENCY"
      ],
      emergency: (...args) => {
        const entry = { type: "error", values: args.map(stringifyArg) };
        logs.push(entry);
        if (isStreaming) emitStreamChunk(requestId, entry);
      },
      debug: (...args) => {
        const entry = { type: "log", values: args.map(stringifyArg) };
        logs.push(entry);
        if (isStreaming) emitStreamChunk(requestId, entry);
      },
      audit: (...args) => {
        const entry = { type: "log", values: args.map(stringifyArg) };
        logs.push(entry);
        if (isStreaming) emitStreamChunk(requestId, entry);
      },
      error: (...args) => {
        const entry = { type: "error", values: args.map(stringifyArg) };
        logs.push(entry);
        if (isStreaming) emitStreamChunk(requestId, entry);
      }
    };

    // ============================================================================
    // Progress Tracking Wrapper
    // ============================================================================

    const createProgressTracker = () => {
      let currentStep = 0;
      let totalSteps = 0;

      return {
        setTotal: (total) => {
          totalSteps = total;
        },
        increment: (message) => {
          currentStep++;
          if (isStreaming && totalSteps > 0) {
            emitProgress(requestId, {
              current: currentStep,
              total: totalSteps,
              percentage: Math.round((currentStep / totalSteps) * 100),
              message
            });
          }
        },
        update: (current, message) => {
          currentStep = current;
          if (isStreaming && totalSteps > 0) {
            emitProgress(requestId, {
              current,
              total: totalSteps,
              percentage: Math.round((current / totalSteps) * 100),
              message
            });
          }
        }
      };
    };

    const progress = createProgressTracker();

    // ============================================================================
    // Modified N object with streaming support
    // ============================================================================

    const modifiedN = {
      ...N,
      log: fakeLog,
      progress // Expose progress tracker to user scripts
    };

    const destructuredKeys = Object.keys(modifiedN).join(", ");
    const wrappedCode = `
      "use strict";
      const { ${destructuredKeys} } = N;
      return (async () => { ${code} })();
    `;

    const asyncFn = new Function("N", "console", wrappedCode);

    // ============================================================================
    // Execute with streaming support
    // ============================================================================

    // Emit start event for streaming
    if (isStreaming) {
      emitStreamChunk(requestId, {
        type: "start",
        message: "Script execution started"
      });
    }

    // Yield before executing to allow UI update
    await yieldToMain();

    const result = await asyncFn(modifiedN, fakeConsole);

    // Yield after execution
    await yieldToMain();

    // Emit completion
    emitComplete(requestId, result);
  } catch (err) {
    const errorEntry = {
      type: "error",
      values: ["Execution error: " + err.message || err]
    };
    logs.push(errorEntry);

    if (isStreaming) {
      emitStreamChunk(requestId, errorEntry);
    }

    emitError(requestId, err);
  }
};
