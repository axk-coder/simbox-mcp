(() => {
  const WS_URL = "ws://127.0.0.1:38888";
  let socket = null;
  let reconnectTimer = null;

  function createIndicator() {
    if (document.getElementById("simbox-mcp-badge")) return;
    const badge = document.createElement("div");
    badge.id = "simbox-mcp-badge";
    badge.style.position = "fixed";
    badge.style.bottom = "8px";
    badge.style.right = "8px";
    badge.style.padding = "4px 8px";
    badge.style.background = "#222222";
    badge.style.color = "#888888";
    badge.style.fontFamily = "monospace";
    badge.style.fontSize = "11px";
    badge.style.border = "1px solid #444444";
    badge.style.borderRadius = "3px";
    badge.style.zIndex = "999999";
    badge.style.userSelect = "none";
    badge.textContent = "MCP: Disconnected";
    document.body.appendChild(badge);
  }

  function updateIndicator(connected) {
    const badge = document.getElementById("simbox-mcp-badge");
    if (!badge) return;
    if (connected) {
      badge.style.color = "#ffffff";
      badge.style.borderColor = "#888888";
      badge.textContent = "MCP: Connected";
    } else {
      badge.style.color = "#666666";
      badge.style.borderColor = "#333333";
      badge.textContent = "MCP: Disconnected";
    }
  }

  function connect() {
    createIndicator();
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        updateIndicator(true);
      };

      socket.onmessage = async (event) => {
        try {
          const req = JSON.parse(event.data);
          if (req.action === "eval") {
            try {
              const fn = new Function(req.code);
              const result = await fn();
              socket.send(JSON.stringify({ id: req.id, result: result !== undefined ? result : null }));
            } catch (evalErr) {
              socket.send(JSON.stringify({ id: req.id, error: evalErr.message || String(evalErr) }));
            }
          }
        } catch (err) {
          console.error(err);
        }
      };

      socket.onclose = () => {
        updateIndicator(false);
        scheduleReconnect();
      };

      socket.onerror = () => {
        updateIndicator(false);
        try {
          socket.close();
        } catch (_) {}
      };
    } catch (_) {
      updateIndicator(false);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connect);
  } else {
    connect();
  }
})();
