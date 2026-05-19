// Mirrors the SpectatorView dataclass shape returned by the backend.
// Keep in sync with src/poker/game.py:SpectatorView.

export type Blind = "SB" | "BB";
export type Street = "pre" | "flop" | "turn" | "river";
export type Phase = "preflop" | "flop" | "turn" | "river" | "ended";
export type SeatKind = "human" | "agent";
export type SeatStatus = "open" | "claimed";

export interface SpectatorSeat {
  seat_id: number;
  name: string;
  initials: string;
  stack: number;
  bet: number;
  position: string;
  hole_cards: string[];
  last_action: string | null;
  folded: boolean;
  to_act: boolean;
  is_dealer: boolean;
  blind: Blind | null;
  kind: SeatKind;
  hand_rank: string | null;
  shows_cards: boolean;
  won_amount: number | null;
  status: SeatStatus;
}

export interface ChatMessage {
  seat_id: number;
  name: string;
  text: string;
  ts: number;
}

export interface HistoryEntry {
  street: Street;
  text: string;
  marker: boolean;
  hand_number: number;
}

export interface SpectatorView {
  table_id: string;
  hand_number: number;
  phase: Phase;
  board: string[];
  pot: number;
  seats: SpectatorSeat[];
  current_actor: number | null;
  last_action_text: string | null;
  history: HistoryEntry[];
  chat: ChatMessage[];
  stats: Record<string, Record<string, number>> | null;
  winner_names: string[] | null;
  game_ended: boolean;
  seats_open: number[];
}

// WebSocket message envelope: `snapshot` on connect, `update` on every mutation,
// `deleted` when the game has been removed.
export interface SnapshotMessage {
  type: "snapshot" | "update";
  view: SpectatorView;
}
export interface DeletedMessage {
  type: "deleted";
}
export type ServerMessage = SnapshotMessage | DeletedMessage;

export interface GameSummary {
  game_id: string;
  seat_count: number;
  seats_filled: number;
  hand_number: number;
  phase: Phase;
  game_ended: boolean;
  created_at: number;
}
