"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPlayerState, joinSeat, playerAct, playerSay } from "./api";
import type { PlayerView } from "./types";

const SESSION_KEY = (gameId: string) => `seat_token:${gameId}`;

export function usePlayerState(gameId: string | null) {
  const [seatToken, setSeatToken] = useState<string | null>(() => {
    if (typeof window === "undefined" || !gameId) return null;
    return sessionStorage.getItem(SESSION_KEY(gameId));
  });
  const [seatId, setSeatId] = useState<number | null>(null);
  const [playerView, setPlayerView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seatTokenRef = useRef(seatToken);
  seatTokenRef.current = seatToken;

  // When gameId changes, reload token from sessionStorage.
  useEffect(() => {
    if (!gameId) {
      setSeatToken(null);
      setSeatId(null);
      setPlayerView(null);
      return;
    }
    const stored = sessionStorage.getItem(SESSION_KEY(gameId));
    setSeatToken(stored);
    if (!stored) {
      setSeatId(null);
      setPlayerView(null);
    }
  }, [gameId]);

  // Poll player state while we have a token.
  useEffect(() => {
    if (!seatToken) {
      setPlayerView(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      let myTurn = false;
      try {
        const v = await getPlayerState(seatToken);
        if (!cancelled) {
          setPlayerView(v);
          setSeatId(v.seat_id);
          setError(null);
          myTurn = v.current_actor === v.seat_id;
        }
      } catch {
        if (!cancelled) setError("lost connection to player state");
      }
      if (!cancelled) {
        timer = setTimeout(poll, myTurn ? 500 : 2000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatToken]);

  const claimSeat = useCallback(
    async (targetGameId: string): Promise<number | null> => {
      setError(null);
      try {
        const res = await joinSeat(targetGameId);
        const token = res.seat_token;
        sessionStorage.setItem(SESSION_KEY(targetGameId), token);
        setSeatToken(token);
        setSeatId(res.seat_id);
        return res.seat_id;
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to join seat");
        return null;
      }
    },
    [],
  );

  const releaseSeat = useCallback(() => {
    if (gameId) sessionStorage.removeItem(SESSION_KEY(gameId));
    setSeatToken(null);
    setSeatId(null);
    setPlayerView(null);
    setError(null);
  }, [gameId]);

  const act = useCallback(
    async (
      action: "fold" | "check" | "call" | "raise" | "bet",
      opts: { amount?: number; bluffDeclared?: boolean; tableChat?: number } = {},
    ): Promise<void> => {
      const token = seatTokenRef.current;
      if (!token) return;
      setError(null);
      try {
        await playerAct({
          seatToken: token,
          action,
          bluffDeclared: opts.bluffDeclared ?? false,
          amount: opts.amount,
          tableChat: opts.tableChat,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "action failed");
      }
    },
    [],
  );

  const say = useCallback(async (phraseId: number): Promise<void> => {
    const token = seatTokenRef.current;
    if (!token) return;
    setError(null);
    try {
      await playerSay(token, phraseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "say failed");
    }
  }, []);

  const isMyturn = !!(
    playerView &&
    playerView.current_actor === playerView.seat_id
  );

  return {
    seatToken,
    seatId,
    playerView,
    error,
    isMyturn,
    claimSeat,
    releaseSeat,
    act,
    say,
  };
}
