import browser from "webextension-polyfill";
import type { Bug, BugCreateRequest, Cycle, Project, User } from "./types";

const DEFAULT_API = "http://localhost:8080";

export async function getApiBase(): Promise<string> {
  const stored = await browser.storage.local.get(["apiBase"]);
  return (stored.apiBase as string) || DEFAULT_API;
}

export async function getToken(): Promise<string | null> {
  const stored = await browser.storage.local.get(["token"]);
  return (stored.token as string) || null;
}

export async function setSession(token: string, apiBase: string) {
  await browser.storage.local.set({ token, apiBase });
}

export async function clearSession() {
  await browser.storage.local.remove(["token"]);
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const [apiBase, token] = await Promise.all([getApiBase(), getToken()]);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${apiBase}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `${res.status} ${res.statusText}`;
    try {
      const body = JSON.parse(text) as { message?: string; detail?: string };
      if (body.message) message = body.message;
      else if (typeof body.detail === "string") message = body.detail;
    } catch {
      /* keep */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function login(email: string, password: string, apiBase: string) {
  return fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ token: string; user: User }>;
  });
}

export const fetchUsers = () => api<User[]>("/api/users");
export const fetchProjects = () => api<Project[]>("/api/projects");
export const fetchCycles = (projectId: string) =>
  api<Cycle[]>(`/api/cycles?projectId=${projectId}`);
export const createBug = (body: BugCreateRequest) =>
  api<Bug>("/api/bugs", { method: "POST", body: JSON.stringify(body) });

export type BugPolishMode = "both" | "title" | "description";

export interface BugPolishResult {
  title: string;
  description: string;
  provider?: string;
  ai?: boolean;
  warning?: string | null;
}

export const polishBugWithAi = (body: {
  title?: string;
  description?: string;
  mode?: BugPolishMode;
}) =>
  api<BugPolishResult>("/api/ai/bug/polish", {
    method: "POST",
    body: JSON.stringify(body),
  });
