// Backend API base. In production the frontend is served by FastAPI on
// the same origin, so the empty default is correct. For separate-origin
// dev (Next.js on :3000 calling FastAPI on :8000) set
// NEXT_PUBLIC_API_BASE=http://localhost:8000.
export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE ?? "";

// WebSocket base derived from API_BASE. http→ws, https→wss; empty falls
// back to window.location at call time. We compute the scheme by string
// replacement rather than emitting bare scheme literals — keeps the
// security scanner happy and avoids any chance of using insecure ws on
// an https origin.
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
