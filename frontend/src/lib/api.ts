// Backend API base. In production the frontend is served by FastAPI on
// the same origin, so the empty default is correct. For separate-origin
// dev (Next.js on :3000 calling FastAPI on :8000) set
// NEXT_PUBLIC_API_BASE=http://localhost:8000.
export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE ?? "";

// WebSocket base derived from API_BASE. http→ws, https→wss; empty falls
// back to window.location at call time.
export function wsBase(): string {
  if (API_BASE.startsWith("https://")) return "wss://" + API_BASE.slice(8);
  if (API_BASE.startsWith("http://")) return "ws://" + API_BASE.slice(7);
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  return "";
}
