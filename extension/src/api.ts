import browser from "webextension-polyfill";
import type { Bug, BugCreateRequest, Environment, Module, Project, Sprint, User } from "./types";

const DEFAULT_API = "http://localhost:8080";

export async function getApiBase(): Promise<string> {
  const stored = await browser.storage.local.get(["apiBase"]);
  return (stored.apiBase as string) || DEFAULT_API;
}

export async function getToken(): Promise<string | null> {
  const stored = await browser.storage.local.get(["token"]);
  return (stored.token as string) || null;
}

export async function setSession(token: string, apiBase: string, user?: User) {
  await browser.storage.local.set({
    token,
    apiBase,
    ...(user ? { user } : {}),
  });
}

export async function clearSession() {
  await browser.storage.local.remove(["token", "user"]);
}

export async function getStoredUser(): Promise<User | null> {
  const stored = await browser.storage.local.get(["user"]);
  return (stored.user as User) || null;
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

/** Extension is Tester-only — reject any other role. */
export function assertExtensionTester(user: User | null | undefined): User {
  if (!user || user.role !== "TESTER") {
    throw new Error(
      "Extension access is for Tester accounts only. Sign in with a Tester role.",
    );
  }
  if (user.mustChangePassword) {
    throw new Error(
      "Change your temporary password on the TestBuddy dashboard before using the extension.",
    );
  }
  return user;
}

export function login(email: string, password: string, apiBase: string) {
  return fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      let message = text || "Login failed";
      try {
        const body = JSON.parse(text) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        /* keep */
      }
      throw new Error(message);
    }
    return res.json() as Promise<{ token: string; user: User }>;
  });
}

export const fetchMe = () => api<User>("/api/auth/me");
export const fetchUsers = () => api<User[]>("/api/users");
export const fetchProjects = () => api<Project[]>("/api/projects");
export const fetchSprints = (projectId: string) =>
  api<Sprint[]>(`/api/sprints?projectId=${encodeURIComponent(projectId)}`);
/** @deprecated Use fetchSprints */
export const fetchCycles = (projectId: string) => fetchSprints(projectId);
export const fetchEnvironments = (projectId: string) =>
  api<Environment[]>(`/api/projects/${projectId}/environments`);
export const fetchModules = (projectId: string) =>
  api<Module[]>(`/api/projects/${projectId}/modules`);
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

export interface HumanizedStep {
  order: number;
  description: string;
  actualResult: string;
  expectedResult?: string;
}

export interface StepsHumanizeResult {
  steps: HumanizedStep[];
  provider?: string;
  ai?: boolean;
  warning?: string | null;
}

export const humanizeStepsWithAi = (body: {
  title?: string;
  description?: string;
  steps: Array<{
    order: number;
    actionType?: string;
    elementLabel?: string;
    valueEntered?: string;
    pageUrl?: string;
    screenshotId?: string;
    overview?: string;
    description?: string;
    actualResult?: string;
    expectedResult?: string;
    isDefect?: boolean;
  }>;
}) =>
  api<StepsHumanizeResult>("/api/ai/steps/humanize", {
    method: "POST",
    body: JSON.stringify(body),
  });
