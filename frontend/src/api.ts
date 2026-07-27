import type { Bug, BugFilters, Cycle, Project, User } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("testbuddy_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function login(email: string, password: string) {
  return api<{ token: string; user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(body: {
  name: string;
  email: string;
  password: string;
  role?: string;
}) {
  return api<{ token: string; user: User }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export const fetchMe = () => api<User>("/api/auth/me");

export function updateProfile(body: {
  name: string;
  currentPassword?: string;
  newPassword?: string;
}) {
  return api<User>("/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export const fetchUsers = () => api<User[]>("/api/users");
export const fetchProjects = () => api<Project[]>("/api/projects");

export interface ProjectDetail extends Project {
  cycleCount: number;
  bugCount: number;
}

export const fetchProject = (id: string) => api<ProjectDetail>(`/api/projects/${id}`);

export type ProjectPayload = {
  name: string;
  jiraProjectKey?: string;
  adoOrgUrl?: string;
  adoProject?: string;
};

export const createProject = (body: ProjectPayload) =>
  api<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) });

export const updateProject = (id: string, body: ProjectPayload) =>
  api<Project>(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const deleteProject = (id: string) =>
  api<void>(`/api/projects/${id}`, { method: "DELETE" });

export const fetchCycles = (projectId: string) =>
  api<Cycle[]>(`/api/cycles?projectId=${encodeURIComponent(projectId)}`);

export function fetchBugs(filters: BugFilters = {}) {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters.cycleId) params.set("cycleId", filters.cycleId);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  return api<Bug[]>(`/api/bugs${qs ? `?${qs}` : ""}`);
}

export const fetchBug = (id: string) => api<Bug>(`/api/bugs/${id}`);

export interface BugExportFile {
  exportedAt: string;
  count: number;
  bugs: Bug[];
}

export interface BugImportResult {
  imported: number;
  bugs: Bug[];
}

function buildBugQuery(filters: BugFilters = {}) {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters.cycleId) params.set("cycleId", filters.cycleId);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function exportBugsJson(filters: BugFilters = {}): Promise<BugExportFile> {
  return api<BugExportFile>(`/api/bugs/export/json${buildBugQuery(filters)}`);
}

export async function exportBugJson(id: string): Promise<BugExportFile> {
  return api<BugExportFile>(`/api/bugs/${id}/export/json`);
}

export function importBugs(bugs: unknown[]) {
  return api<BugImportResult>("/api/bugs/import", {
    method: "POST",
    body: JSON.stringify({ bugs }),
  });
}
