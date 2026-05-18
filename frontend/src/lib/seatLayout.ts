// Seat ring geometry — ported verbatim from
// design/project/proto-shared.jsx:221-235. The math is tuned with the
// designer's notes; do not re-derive.
//
// Indices map to seats around a 6-max felt:
//   0 top-center  · 1 top-right  · 2 bottom-right
//   3 bottom-center (hero) · 4 bottom-left · 5 top-left

export interface SeatPlacement {
  x: number;
  y: number;
  chipX: number;
  chipY: number;
  align: "top" | "topright" | "botright" | "bot" | "botleft" | "topleft";
}

export const SEAT_LAYOUT: SeatPlacement[] = [
  { x: 0, y: -180, chipX: 90, chipY: -130, align: "top" },
  { x: 330, y: -118, chipX: 195, chipY: -64, align: "topright" },
  { x: 330, y: 118, chipX: 195, chipY: 64, align: "botright" },
  { x: 0, y: 185, chipX: 100, chipY: 130, align: "bot" },
  { x: -330, y: 118, chipX: -195, chipY: 64, align: "botleft" },
  { x: -330, y: -118, chipX: -195, chipY: -64, align: "topleft" },
];
