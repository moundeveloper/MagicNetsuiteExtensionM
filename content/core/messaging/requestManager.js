export class RequestManager {
  constructor() {
    this.activeRequests = new Map();
  }

  addRequest(requestId, handler) {
    this.activeRequests.set(requestId, handler);
  }

  removeRequest(requestId) {
    this.activeRequests.delete(requestId);
  }

  abortRequest(requestId) {
    const handler = this.activeRequests.get(requestId);
    if (handler && typeof handler.abort === "function") {
      handler.abort();
      this.removeRequest(requestId);
      return true;
    }
    return false;
  }

  abortAll() {
    this.activeRequests.forEach((handler) => {
      if (typeof handler.abort === "function") {
        handler.abort();
      }
    });
    this.activeRequests.clear();
  }

  getActiveCount() {
    return this.activeRequests.size;
  }
}
