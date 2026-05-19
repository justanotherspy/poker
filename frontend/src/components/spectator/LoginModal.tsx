// LoginModal — single shared-password gate for the spectator UI.
//
// Submits the password, hashes it client-side via the AuthProvider's
// `login`, and shows an inline error on rejection. Rendered when the
// auth hash is absent.

"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";

export function LoginModal() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(evt: FormEvent<HTMLFormElement>) {
    evt.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ok = await login(password);
      if (!ok) {
        setError("That password didn't work.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h2 className="modal-title">enter spectator password</h2>
        <p className="modal-subtitle">
          this server is dev-gated. enter the shared spectator password to
          watch and manage games.
        </p>
        <form onSubmit={onSubmit} className="modal-form">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            autoFocus
            disabled={busy}
            className="modal-input"
          />
          {error && <div className="modal-error">{error}</div>}
          <button
            type="submit"
            disabled={busy || password.length === 0}
            className="modal-button modal-button--primary"
          >
            {busy ? "verifying…" : "enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
