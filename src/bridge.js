import { WebSocketServer, WebSocket } from "ws";

const PORT = 38888;
const CDP_URL = "http://127.0.0.1:9222/json";
const TARGET_HOST = "guttobear.github.io";

export class SimBoxBridge {
  constructor() {
    this.wsServer = null;
    this.clientWs = null;
    this.cdpWs = null;
    this.pendingRequests = new Map();
    this.requestId = 1;
    this.statusListeners = [];
    this.lastState = false;
    this.cdpCheckInterval = null;
  }

  start() {
    this.wsServer = new WebSocketServer({
      port: PORT,
      host: "127.0.0.1",
      verifyClient: (info, done) => {
        const origin = info.origin || info.req.headers.origin;
        if (!origin || origin === "null") {
          done(false, 403, "Origin header required");
          return;
        }
        try {
          const parsed = new URL(origin);
          if (parsed.protocol === "https:" && parsed.hostname === TARGET_HOST) {
            done(true);
            return;
          }
          if (parsed.protocol === "chrome-extension:" || parsed.protocol === "moz-extension:") {
            done(true);
            return;
          }
        } catch (_) {}
        done(false, 403, "Forbidden origin");
      }
    });

    this.wsServer.on("connection", (ws) => {
      if (this.clientWs) {
        try {
          this.clientWs.close();
        } catch (_) {}
      }
      this.clientWs = ws;
      this.checkStateChange();

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id && this.pendingRequests.has(msg.id)) {
            const { resolve, reject, timer } = this.pendingRequests.get(msg.id);
            clearTimeout(timer);
            this.pendingRequests.delete(msg.id);
            if (msg.error) {
              reject(new Error(msg.error));
            } else {
              resolve(msg.result);
            }
          }
        } catch (e) {
          console.error(e.message);
        }
      });

      ws.on("close", () => {
        if (this.clientWs === ws) {
          this.clientWs = null;
          this.checkStateChange();
        }
      });

      ws.on("error", () => {
        if (this.clientWs === ws) {
          this.clientWs = null;
          this.checkStateChange();
        }
      });
    });

    this.cdpCheckInterval = setInterval(() => {
      if (!this.clientWs) {
        this.checkCdp();
      }
    }, 2000);
  }

  checkStateChange() {
    const current = this.isConnected();
    if (current !== this.lastState) {
      this.lastState = current;
      for (const listener of this.statusListeners) {
        try {
          listener(current);
        } catch (_) {}
      }
    }
  }

  onStatusChange(callback) {
    this.statusListeners.push(callback);
  }

  isConnected() {
    return (
      (this.clientWs !== null && this.clientWs.readyState === WebSocket.OPEN) ||
      (this.cdpWs !== null && this.cdpWs.readyState === WebSocket.OPEN)
    );
  }

  async checkCdp() {
    try {
      const res = await fetch(CDP_URL);
      if (!res.ok) return;
      const tabs = await res.json();
      const simboxTab = tabs.find((t) => {
        if (t.type !== "page" || !t.url) return false;
        try {
          const u = new URL(t.url);
          return u.hostname === TARGET_HOST && u.pathname.startsWith("/simbox2.0");
        } catch (_) {
          return false;
        }
      });

      if (simboxTab && simboxTab.webSocketDebuggerUrl) {
        if (this.cdpWs && this.cdpWs.readyState === WebSocket.OPEN) {
          return;
        }
        this.cdpWs = new WebSocket(simboxTab.webSocketDebuggerUrl);
        this.cdpWs.on("open", () => {
          this.checkStateChange();
        });
        this.cdpWs.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.id && this.pendingRequests.has(msg.id)) {
              const { resolve, reject, timer } = this.pendingRequests.get(msg.id);
              clearTimeout(timer);
              this.pendingRequests.delete(msg.id);
              if (msg.error) {
                reject(new Error(msg.error.message || JSON.stringify(msg.error)));
              } else if (msg.result && msg.result.exceptionDetails) {
                reject(new Error(msg.result.exceptionDetails.text || "Execution error"));
              } else {
                resolve(msg.result ? msg.result.result ? msg.result.result.value : msg.result : null);
              }
            }
          } catch (e) {
            console.error(e.message);
          }
        });
        this.cdpWs.on("close", () => {
          this.cdpWs = null;
          this.checkStateChange();
        });
        this.cdpWs.on("error", () => {
          this.cdpWs = null;
          this.checkStateChange();
        });
      } else {
        if (this.cdpWs) {
          this.cdpWs.close();
          this.cdpWs = null;
          this.checkStateChange();
        }
      }
    } catch (_) {
      if (this.cdpWs) {
        this.cdpWs = null;
        this.checkStateChange();
      }
    }
  }

  async evalScript(code) {
    if (!this.isConnected()) {
      throw new Error("SimBox 2.0 is not open at https://" + TARGET_HOST + "/simbox2.0/");
    }

    const id = this.requestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("SimBox evaluation timed out after 10000ms"));
        }
      }, 10000);

      this.pendingRequests.set(id, { resolve, reject, timer });

      if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
        this.clientWs.send(JSON.stringify({ id, action: "eval", code }));
      } else if (this.cdpWs && this.cdpWs.readyState === WebSocket.OPEN) {
        this.cdpWs.send(
          JSON.stringify({
            id,
            method: "Runtime.evaluate",
            params: {
              expression: `(function(){ ${code} })()`,
              returnByValue: true,
              awaitPromise: true
            }
          })
        );
      } else {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(new Error("No active browser connection to SimBox"));
      }
    });
  }

  stop() {
    if (this.cdpCheckInterval) {
      clearInterval(this.cdpCheckInterval);
    }
    if (this.clientWs) {
      this.clientWs.close();
    }
    if (this.cdpWs) {
      this.cdpWs.close();
    }
    if (this.wsServer) {
      this.wsServer.close();
    }
  }
}
