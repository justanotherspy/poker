// Mirrors the SpectatorView dataclass shape returned by the backend.
// Keep in sync with src/poker/game.py:SpectatorView.

export type Blind = "SB" | "BB";
export type Street = "pre" | "flop" | "turn" | "river";
export type Phase = "preflop" | "flop" | "turn" | "river" | "ended";
export type SeatKind = "human" | "agent";

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
}

// WebSocket message envelope: `snapshot` on connect, `update` on every mutation.
export interface SnapshotMessage {
  type: "snapshot" | "update";
  view: SpectatorView;
}
