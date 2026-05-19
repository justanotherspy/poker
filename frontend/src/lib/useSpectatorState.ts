// useSpectatorState — game-scoped WebSocket-driven spectator view.
//
// Pass the game_id to subscribe to. Pass null to disconnect. The hook
// opens /api/spectate/ws/{gameId}?password=<hash>, sets `view` from
// snapshot/update messages, reconnects with exponential backoff (1s →
// 10s) on close, and falls back to polling /api/spectate/state/{gameId}
// every 2s while disconnected. When the server publishes a `deleted`
// message (the game was removed), `view` clears and `gameMissing` flips
// to true so the parent can switch back to the game picker.

"use client";

import { useEffect, useRef, useState } from "react";
import {
  API_BASE,
  fetchSpectatorState,
  getAuthHash,
  wsBase,
} from "./api";
import type { ServerMessage, SpectatorView } from "./types";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "idle";

export function useSpectatorState(gameId: string | null) {
  const [view, setView] = useState<SpectatorView | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [gameMissing, setGameMissing] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const backoffRef = useRef(1000);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setView(null);
    setGameMissing(false);

    if (gameId === null) {
      setConnectionState("idle");
      return;
    }

    setConnectionState("connecting");

    const restFallback = async () => {
      try {
        const data = await fetchSpectatorState(gameId);
        if (data === null) {
          setGameMissing(true);
          return;
        }
        setView(data);
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
      const hash = getAuthHash() ?? "";
      const url = `${wsBase()}/api/spectate/ws/${encodeURIComponent(gameId)}?password=${encodeURIComponent(hash)}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
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
          const msg: ServerMessage = JSON.parse(evt.data);
          if (msg.type === "snapshot" || msg.type === "update") {
            setView(msg.view);
          } else if (msg.type === "deleted") {
            setView(null);
            setGameMissing(true);
            cancelledRef.current = true;
            ws.close();
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
    // API_BASE is referenced indirectly through wsBase() / fetchSpectatorState;
    // it's stable for a single page load, so we don't need to depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  return { view, connectionState, gameMissing };
}

// Re-export so consumers can rely on the same module for both helpers.
export { API_BASE };
