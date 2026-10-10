"use client";

/**
 * AuthContext — provides the current user, login, and logout actions.
 *
 * Token is stored in sessionStorage under the key "ns_token".
 * The token expires in 15 minutes (backend-enforced). When the backend
 * returns 401 the "auth:expired" event is dispatched by api.ts; this
 * provider listens for it and clears state, then redirects to /login.
 *
 * We deliberately avoid persisting the token to localStorage to limit
 * cross-tab token leakage. Closing the tab clears the session.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = "ns_token";
const EXPIRY_KEY = "ns_token_expiry";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAuth = useCallback(() => {
    setUser(null);
    setToken(null);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(EXPIRY_KEY);
    }
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
  }, []);

  // Schedule a redirect to /login just before the token expires.
  const scheduleExpiry = useCallback(
    (expiresInSeconds: number) => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      // Warn 30 s early so the UI has time to react.
      const ms = Math.max((expiresInSeconds - 30) * 1000, 0);
      refreshTimerRef.current = setTimeout(() => {
        clearAuth();
        router.push("/login");
      }, ms);
    },
    [clearAuth, router]
  );

  // On mount, restore the session from sessionStorage and validate it.
  useEffect(() => {
    const stored = sessionStorage.getItem(TOKEN_KEY);
    const expiryStr = sessionStorage.getItem(EXPIRY_KEY);

    if (!stored) {
      setIsLoading(false);
      return;
    }

    // Check local expiry before hitting the network.
    if (expiryStr) {
      const expiresAt = Number(expiryStr);
      if (Date.now() >= expiresAt) {
        clearAuth();
        setIsLoading(false);
        return;
      }
    }

    // Validate with the backend.
    api.auth
      .me()
      .then(({ user }) => {
        setUser(user);
        setToken(stored);
        if (expiryStr) {
          const remaining = Math.floor((Number(expiryStr) - Date.now()) / 1000);
          if (remaining > 0) scheduleExpiry(remaining);
        }
      })
      .catch(() => {
        clearAuth();
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for the 401 event emitted by api.ts.
  useEffect(() => {
    const handler = () => {
      clearAuth();
      router.push("/login");
    };
    window.addEventListener("auth:expired", handler);
    return () => window.removeEventListener("auth:expired", handler);
  }, [clearAuth, router]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.auth.login(email, password);
      sessionStorage.setItem(TOKEN_KEY, data.token);
      const expiresAt = Date.now() + data.expiresIn * 1000;
      sessionStorage.setItem(EXPIRY_KEY, String(expiresAt));
      setToken(data.token);
      setUser(data.user);
      scheduleExpiry(data.expiresIn);
    },
    [scheduleExpiry]
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // best effort – clear locally regardless
    } finally {
      clearAuth();
      router.push("/login");
    }
  }, [clearAuth, router]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
