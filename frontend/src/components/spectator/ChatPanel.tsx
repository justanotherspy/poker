// Read-only chat panel. Spectators cannot send messages — the footer
// shows the prototype's "spectating · chat is read-only" notice.

import type { ChatMessage } from "@/lib/types";

export function ChatPanel({ chat }: { chat: ChatMessage[] }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="label">chat</span>
        <span className="meta">{chat.length} msg</span>
      </div>
      <div className="panel-body chat-stream">
        {chat.length === 0 ? (
          <div className="chat-empty">No messages yet.</div>
        ) : (
          chat.map((m, i) => (
            <div key={i} className="chat-line">
              <span className="chat-who">{m.name}</span>
              <span className="chat-colon">:</span>
              <span className="chat-msg">{m.text}</span>
            </div>
          ))
        )}
      </div>
      <div className="panel-footer">
        <div className="chat-spectator-notice">
          <svg
            viewBox="0 0 16 16"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
            <circle cx="8" cy="8" r="2" />
          </svg>
          <span>spectating — chat is read-only</span>
        </div>
      </div>
    </div>
  );
}
