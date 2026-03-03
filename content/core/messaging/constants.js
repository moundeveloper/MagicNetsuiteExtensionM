export const MESSAGE_TYPES = {
  TO_EXTENSION: "TO_EXTENSION",
  FROM_EXTENSION: "FROM_EXTENSION",
  STREAM_END: "STREAM_END",
  STREAM_ERROR: "STREAM_ERROR",
  STREAM_ABORT: "STREAM_ABORT"
};

export const REQUEST_MODES = {
  NORMAL: "normal",
  STREAM: "stream"
};

export const STREAM_TIMEOUT = 30000; // 30 seconds
export const MAX_RETRY_ATTEMPTS = 3;

export const generateRequestId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
};

export const createMessageFilter = (requestId) => (event) => {
  if (event.source !== window) return false;
  if (event.data?.type !== MESSAGE_TYPES.TO_EXTENSION) return false;
  if (event.data?.payload?.requestId !== requestId) return false;
  return true;
};
