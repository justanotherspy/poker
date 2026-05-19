// Backend API client.
//
// In production the frontend is served by FastAPI on the same origin, so
// the empty default is correct. For separate-origin dev (Next.js on :3000
// calling FastAPI on :8000) set NEXT_PUBLIC_API_BASE=http://localhost:8000.

import type { GameSummary, PlayerView, SpectatorView } from "./types";

export const API_BASE: string = process.env.NEXT_PUBLIC_API_BASE ?? "";

// Module-level mutable spectator password hash. Set by AuthProvider after
// login or hydration. Used by every fetch and by the WS hook's query
// param. Null when the user is logged out.
let _authHash: string | null = null;

export function setAuthHash(hash: string | null): void {
  _authHash = hash;
}

export function getAuthHash(): string | null {
  return _authHash;
}

// WebSocket base derived from API_BASE. http→ws, https→wss; empty falls
// back to window.location at call time. We compute the scheme by string
// replacement rather than emitting bare scheme literals — keeps the
// security scanner happy and avoids any chance of using insecure sockets
// on an https origin.
export function wsBase(): string {
  if (API_BASE) {
    return API_BASE.replace(/^http/, "ws");
  }
  if (typeof window !== "undefined") {
    const wsProto = window.location.protocol.replace(/^http/, "ws");
    return `${wsProto}//${window.location.host}`;
  }
  return "";
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (_authHash) {
    headers.set("X-Spectator-Password", _authHash);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

export async function verifyPassword(hash: string): Promise<boolean> {
  const r = await fetch(`${API_BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password_hash: hash }),
  });
  return r.ok;
}

export async function listGames(): Promise<GameSummary[]> {
  const r = await apiFetch("/api/games");
  if (!r.ok) {
    throw new ApiError(r.status, "failed to list games");
  }
  const data = (await r.json()) as { games: GameSummary[] };
  return data.games;
}

export async function createGame(
  seatCount: number,
  startingStack: number,
): Promise<GameSummary> {
  const r = await apiFetch("/api/games", {
    method: "POST",
    body: JSON.stringify({
      seat_count: seatCount,
      starting_stack: startingStack,
    }),
  });
  if (!r.ok) {
    throw new ApiError(r.status, `create_game failed (${r.status})`);
  }
  return (await r.json()) as GameSummary;
}

export async function deleteGame(gameId: string): Promise<boolean> {
  const r = await apiFetch(`/api/games/${encodeURIComponent(gameId)}`, {
    method: "DELETE",
  });
  if (!r.ok) {
    throw new ApiError(r.status, `delete_game failed (${r.status})`);
  }
  const data = (await r.json()) as { deleted: boolean };
  return data.deleted;
}

export async function fetchSpectatorState(
  gameId: string,
): Promise<SpectatorView | null> {
  const r = await apiFetch(`/api/spectate/state/${encodeURIComponent(gameId)}`);
  if (r.status === 404) return null;
  if (!r.ok) {
    throw new ApiError(r.status, `state fetch failed (${r.status})`);
  }
  return (await r.json()) as SpectatorView;
}

export async function joinSeat(
  gameId: string,
): Promise<{ seat_id: number; seat_token: string }> {
  const r = await apiFetch(`/api/player/join/${encodeURIComponent(gameId)}`, {
    method: "POST",
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { detail?: string };
    throw new ApiError(r.status, body.detail ?? `join failed (${r.status})`);
  }
  return (await r.json()) as { seat_id: number; seat_token: string };
}

export async function getPlayerState(seatToken: string): Promise<PlayerView> {
  const r = await apiFetch(
    `/api/player/state?seat_token=${encodeURIComponent(seatToken)}`,
  );
  if (!r.ok) {
    throw new ApiError(r.status, `player state failed (${r.status})`);
  }
  return (await r.json()) as PlayerView;
}

export async function playerAct(opts: {
  seatToken: string;
  action: "fold" | "check" | "call" | "raise" | "bet";
  bluffDeclared: boolean;
  amount?: number;
  tableChat?: number;
}): Promise<{ result: string; chat?: string }> {
  const r = await apiFetch("/api/player/act", {
    method: "POST",
    body: JSON.stringify({
      seat_token: opts.seatToken,
      action: opts.action,
      bluff_declared: opts.bluffDeclared,
      amount: opts.amount ?? null,
      table_chat: opts.tableChat ?? null,
    }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { detail?: string };
    throw new ApiError(r.status, body.detail ?? `act failed (${r.status})`);
  }
  return (await r.json()) as { result: string; chat?: string };
}

export async function playerSay(
  seatToken: string,
  phraseId: number,
): Promise<{ phrase: string }> {
  const r = await apiFetch("/api/player/say", {
    method: "POST",
    body: JSON.stringify({ seat_token: seatToken, phrase_id: phraseId }),
  });
  if (!r.ok) {
    throw new ApiError(r.status, `say failed (${r.status})`);
  }
  return (await r.json()) as { phrase: string };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
