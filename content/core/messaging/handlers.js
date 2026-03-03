import {
  MESSAGE_TYPES,
  STREAM_TIMEOUT,
  createMessageFilter,
  MAX_RETRY_ATTEMPTS
} from "./constants.js";

export class StreamHandler {
  constructor(requestId, sendChunk) {
    this.requestId = requestId;
    this.sendChunk = sendChunk;
    this.timeoutId = null;
    this.isActive = true;
    this.chunkCount = 0;
  }

  start() {
    this.handleStream = this.handleStream.bind(this);
    window.addEventListener("message", this.handleStream);

    this.timeoutId = setTimeout(() => {
      this.sendChunk({
        status: "error",
        error: "Stream timeout",
        isComplete: true
      });
      this.cleanup();
    }, STREAM_TIMEOUT);
  }

  handleStream(event) {
    if (!this.isActive) return;
    if (!createMessageFilter(this.requestId)(event)) return;

    const { payload } = event.data;
    this.chunkCount++;

    switch (payload.type) {
      case MESSAGE_TYPES.STREAM_END:
        console.log(
          "[StreamHandler] Received stream end, sending last chunk",
          payload
        );
        this.sendChunk({ ...payload, isComplete: true });
        this.cleanup();
        break;

      case MESSAGE_TYPES.STREAM_ERROR:
        console.log("[StreamHandler] Received stream error", payload);
        this.sendChunk({
          status: "error",
          error: payload.error,
          isComplete: true
        });
        this.cleanup();
        break;

      case MESSAGE_TYPES.STREAM_ABORT:
        console.log("[StreamHandler] Received stream abort", payload);
        this.cleanup();
        break;

      default:
        console.log("[StreamHandler] Received stream chunk", payload);
        this.sendChunk({ ...payload, isComplete: false });
    }
  }

  cleanup() {
    this.isActive = false;
    window.removeEventListener("message", this.handleStream);
    clearTimeout(this.timeoutId);
  }

  abort() {
    this.cleanup();
  }
}

export class NormalRequestHandler {
  constructor(requestId, sendResponse, retryAttempts = 0) {
    this.requestId = requestId;
    this.sendResponse = sendResponse;
    this.retryAttempts = retryAttempts;
    this.timeoutId = null;
    this.isActive = true;
  }

  start() {
    this.handleResponse = this.handleResponse.bind(this);
    window.addEventListener("message", this.handleResponse);

    this.timeoutId = setTimeout(() => {
      if (this.retryAttempts < MAX_RETRY_ATTEMPTS) {
        console.warn(
          `[Request ${this.requestId}] Timeout, retrying... (${this.retryAttempts + 1}/${MAX_RETRY_ATTEMPTS})`
        );
        this.cleanup();
        this.sendResponse({
          status: "retry",
          requestId: this.requestId,
          attempt: this.retryAttempts + 1
        });
      } else {
        console.error(
          `[Request ${this.requestId}] Timeout after ${MAX_RETRY_ATTEMPTS} attempts`
        );
        this.sendResponse({
          status: "error",
          error: "Request timeout",
          requestId: this.requestId
        });
        this.cleanup();
      }
    }, STREAM_TIMEOUT);

    console.log(`[Request ${this.requestId}] Started`);
  }

  handleResponse(event) {
    if (!this.isActive) return;
    if (!createMessageFilter(this.requestId)(event)) return;

    const { payload } = event.data;
    console.log(`[Request ${this.requestId}] Response received`, payload);

    this.sendResponse(payload);
    this.cleanup();
  }

  cleanup() {
    this.isActive = false;
    window.removeEventListener("message", this.handleResponse);

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
