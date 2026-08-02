import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "./types";
import { clearAuthStorage } from "./authEvents";

interface AuthState {
  token: string | null;
  user: User | null;
  ready: boolean;
  setSession: (token: string, user: User) => void;
  updateUser: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = "testbuddy_token";
const USER_KEY = "testbuddy_user";

function readUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => readUser());
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    clearAuthStorage();
    setToken(null);
    setUser(null);
  }, []);

  const setSession = useCallback((nextToken: string, nextUser: User) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const updateUser = useCallback((nextUser: User) => {
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  // Validate stored token on boot — stale JWT was causing 401 + empty data.
  useEffect(() => {
    let cancelled = false;

    async function validate() {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (!stored) {
        if (!cancelled) {
          setToken(null);
          setUser(null);
          setReady(true);
        }
        return;
      }

      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (!res.ok) {
          clearAuthStorage();
          if (!cancelled) {
            setToken(null);
            setUser(null);
          }
        } else {
          const me = (await res.json()) as User;
          localStorage.setItem(USER_KEY, JSON.stringify(me));
          if (!cancelled) {
            setToken(stored);
            setUser(me);
          }
        }
      } catch {
        // Network blip — keep session, pages will retry
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void validate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onUnauthorized() {
      logout();
    }
    window.addEventListener("testbuddy:unauthorized", onUnauthorized);
    return () => window.removeEventListener("testbuddy:unauthorized", onUnauthorized);
  }, [logout]);

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      ready,
      setSession,
      updateUser,
      logout,
    }),
    [token, user, ready, setSession, updateUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
