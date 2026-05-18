// AuthProvider — localStorage-backed spectator password hash.
//
// The plaintext password lives only in the user's head. We hash it with
// SHA-256 in the browser, store the hash in localStorage, and send it on
// every request (header for fetch, query param for WebSocket). If the
// hash is missing or the backend rejects it, the LoginModal gates the app.

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { sha256Hex } from "./crypto";
import { setAuthHash, verifyPassword } from "./api";

const STORAGE_KEY = "spectator-password-hash";

interface AuthState {
  hash: string | null;
  ready: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hash, setHash] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage on mount. Until this runs we render nothing
  // (well, the provider's children may show a loading placeholder via
  // `ready`).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHash(stored);
        setAuthHash(stored);
      }
    } catch {
      // localStorage unavailable — fall through to login flow
    }
    setReady(true);
  }, []);

  const login = useCallback(async (password: string): Promise<boolean> => {
    const candidate = await sha256Hex(password);
    setAuthHash(candidate);
    const ok = await verifyPassword(candidate);
    if (!ok) {
      setAuthHash(hash ?? null);
      return false;
    }
    setHash(candidate);
    try {
      localStorage.setItem(STORAGE_KEY, candidate);
    } catch {
      // ignore
    }
    return true;
  }, [hash]);

  const logout = useCallback(() => {
    setHash(null);
    setAuthHash(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ hash, ready, login, logout }),
    [hash, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
