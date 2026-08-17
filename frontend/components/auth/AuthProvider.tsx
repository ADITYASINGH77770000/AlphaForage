"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   Session state for the whole app.

   The session token lives in an httpOnly cookie set by the API, so this layer
   never touches it — it just asks /api/auth/me who we are. `credentials:
   "include"` matters: requests go through the Next rewrite, same-origin.
   ────────────────────────────────────────────────────────────────────────── */

export type User = {
  id: string;
  email: string;
  name: string;
  created_at: number;
  /** false until the guided tour has been completed once for this account. */
  onboarded: boolean;
  last_login: number | null;
};

type AuthState = {
  user: User | null;
  /** true until the first /me check resolves — guards flash-of-logged-out. */
  loading: boolean;
  signup: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  markOnboarded: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.detail) detail = String(j.detail);
    } catch {
      /* keep the generic message */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await call<{ user: User | null }>("/api/auth/me");
      setUser(r.user);
    } catch {
      setUser(null);   // API down — treat as signed out rather than crashing
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const r = await call<{ user: User }>("/api/auth/signup", { name, email, password });
    setUser(r.user);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await call<{ user: User }>("/api/auth/login", { email, password });
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    try { await call("/api/auth/logout", {}); } catch { /* best effort — the
      cookie is cleared server-side; a failed call must not strand the user
      inside the portal. */ }

    // Leave via a full page load rather than router.push, deliberately: it
    // drops the App Router's client cache and every module's in-memory state,
    // so nothing from the old session survives the exit. Straight to /login —
    // the site is a private portal, so signing out ends it then and there
    // rather than leaving a browsable page behind.
    // The page is replaced immediately, so there is no need to setUser(null).
    window.location.assign("/login");
  }, []);

  const markOnboarded = useCallback(async () => {
    setUser((u) => (u ? { ...u, onboarded: true } : u));   // optimistic
    try { await call("/api/auth/onboarded", {}); } catch { /* retried next login */ }
  }, []);

  const value = useMemo(
    () => ({ user, loading, signup, login, logout, markOnboarded }),
    [user, loading, signup, login, logout, markOnboarded]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
