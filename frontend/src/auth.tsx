import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { User } from "./types";

interface AuthState {
  token: string | null;
  user: User | null;
  setSession: (token: string, user: User) => void;
  updateUser: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function readUser(): User | null {
  const raw = localStorage.getItem("testbuddy_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("testbuddy_token"),
  );
  const [user, setUser] = useState<User | null>(() => readUser());

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      setSession: (nextToken, nextUser) => {
        localStorage.setItem("testbuddy_token", nextToken);
        localStorage.setItem("testbuddy_user", JSON.stringify(nextUser));
        setToken(nextToken);
        setUser(nextUser);
      },
      updateUser: (nextUser) => {
        localStorage.setItem("testbuddy_user", JSON.stringify(nextUser));
        setUser(nextUser);
      },
      logout: () => {
        localStorage.removeItem("testbuddy_token");
        localStorage.removeItem("testbuddy_user");
        setToken(null);
        setUser(null);
      },
    }),
    [token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
