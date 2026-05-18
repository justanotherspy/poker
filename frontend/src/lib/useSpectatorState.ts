// useSpectatorState — WebSocket-driven spectator view subscription.
//
// Connects to /api/spectate/ws, sets `view` from snapshot/update
// messages, reconnects on close with exponential backoff (1s → 10s),
// and falls back to polling /api/spectate/state every 2s while
// disconnected.

"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE, wsBase } from "./api";
import type { SnapshotMessage, SpectatorView } from "./types";

export type ConnectionState = "connecting" | "live" | "reconnecting";

export function useSpectatorState() {
  const [view, setView] = useState<SpectatorView | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const backoffRef = useRef(1000);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const restFallback = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/spectate/state`);
        if (r.ok) {
          const data: SpectatorView = await r.json();
          setView(data);
        }
      } catch {
        // ignore; ws may come back
      }
    };

    const startPolling = () => {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(restFallback, 2000);
    };
    const stopPolling = () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };

    const connect = () => {
      if (cancelledRef.current) return;
      setConnectionState((prev) => (prev === "live" ? "reconnecting" : prev));
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${wsBase()}/api/spectate/ws`);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1000;
        setConnectionState("live");
        stopPolling();
      };
      ws.onmessage = (evt) => {
        try {
          const msg: SnapshotMessage = JSON.parse(evt.data);
          if (msg.type === "snapshot" || msg.type === "update") {
            setView(msg.view);
          }
        } catch {
          // ignore malformed
        }
      };
      ws.onerror = () => {
        // Allow close handler to schedule a reconnect.
      };
      ws.onclose = () => {
        if (cancelledRef.current) return;
        setConnectionState("reconnecting");
        startPolling();
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, 10000);
        connect();
      }, backoffRef.current);
    };

    // Initial snapshot via REST (faster than waiting on the WS).
    void restFallback();
    connect();

    return () => {
      cancelledRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      stopPolling();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  return { view, connectionState };
}
