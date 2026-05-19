"use client";

import type { ChatMessage } from "@/lib/types";

const PHRASES: Record<number, string> = {
  1: "Nice hand.",
  2: "Wow, lucky!",
  3: "I see you.",
  4: "Bold move.",
  5: "Let's go.",
  6: "Good game.",
  7: "Really?",
  8: "Interesting.",
  9: "Time to go.",
  10: "All in!",
};

export function ChatPanel({
  chat,
  playerContext,
}: {
  chat: ChatMessage[];
  playerContext?: { onSay: (phraseId: number) => Promise<void> };
}) {
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
        {playerContext ? (
          <div className="chat-phrases">
            {Object.entries(PHRASES).map(([id, text]) => (
              <button
                key={id}
                className="chat-phrase-btn"
                onClick={() => playerContext.onSay(Number(id))}
                title={text}
              >
                {text}
              </button>
            ))}
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
